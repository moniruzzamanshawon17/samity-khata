"""Read-only tools the chat model can call.

Every tool runs as the logged-in user and goes through the same services and
permission checks as the matching API endpoint, so the model can never see more
than the user could through the API. Errors come back to the model as data
({"error": ..., "status": ...}) so it can explain them.
"""

import logging
from datetime import date
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.integrations.embeddings import get_embedding_client
from app.integrations.llm.base import ToolCall, ToolSpec
from app.modules.auth.models import User, UserRole
from app.modules.auth.repositories import UserRepository
from app.modules.bylaws.repositories import BylawRepository
from app.modules.bylaws.services import BylawService
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.services import LoanService
from app.modules.members.dependencies import get_accessible_member
from app.modules.members.models import Member
from app.modules.members.repositories import MemberRepository
from app.modules.members.services import MemberService
from app.modules.samities.repositories import SamityRepository
from app.modules.transactions.repositories import TransactionRepository
from app.modules.transactions.services import TransactionService

logger = logging.getLogger(__name__)

_MEMBER_ID = {"member_id": {"type": "integer", "description": "The member's id"}}

SPECS = {
    "find_members": ToolSpec(
        "find_members",
        "Find members by name, phone or member number (staff and admin only).",
        {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Name, phone or member number"}},
            "required": ["query"],
        },
    ),
    "get_member": ToolSpec(
        "get_member",
        "A member's details: name, member number, samity, status and joining date.",
        {"type": "object", "properties": _MEMBER_ID, "required": ["member_id"]},
    ),
    "get_balance": ToolSpec(
        "get_balance",
        "A member's savings balance, unpaid monthly deposits, the most they can withdraw now "
        "and the largest loan they could get.",
        {"type": "object", "properties": _MEMBER_ID, "required": ["member_id"]},
    ),
    "list_transactions": ToolSpec(
        "list_transactions",
        "A member's recent transactions (deposits, withdrawals, repayments, reversals), newest first.",
        {
            "type": "object",
            "properties": {
                **_MEMBER_ID,
                "from_date": {"type": "string", "description": "Earliest date, YYYY-MM-DD"},
                "to_date": {"type": "string", "description": "Latest date, YYYY-MM-DD"},
                "limit": {"type": "integer", "description": "How many, 1 to 20 (default 10)"},
            },
            "required": ["member_id"],
        },
    ),
    "get_loans": ToolSpec(
        "get_loans",
        "A member's loans with status, amount still owed, instalment and next due date.",
        {"type": "object", "properties": _MEMBER_ID, "required": ["member_id"]},
    ),
    "get_loan_schedule": ToolSpec(
        "get_loan_schedule",
        "The planned repayment schedule of a loan: due dates, payment, interest and principal.",
        {
            "type": "object",
            "properties": {"loan_id": {"type": "integer", "description": "The loan's id"}},
            "required": ["loan_id"],
        },
    ),
    "search_bylaws": ToolSpec(
        "search_bylaws",
        "Search the samity's bylaws (English and Bangla) for the clauses that answer a "
        "question. Use for any question about rules.",
        {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question, in the user's words"},
                "samity_id": {"type": "integer", "description": "Optional samity to search"},
            },
            "required": ["question"],
        },
    ),
}


def with_taka(value: Any) -> Any:
    """Add a "..._taka" text next to every "..._paisa" amount, so the model never
    has to convert units itself."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            out[key] = with_taka(item)
            if key.endswith("_paisa") and isinstance(item, int):
                out[key[: -len("_paisa")] + "_taka"] = f"Tk {item / 100:,.2f}"
        return out
    if isinstance(value, list):
        return [with_taka(item) for item in value]
    return value


def _dump(model: BaseModel) -> dict[str, Any]:
    return with_taka(model.model_dump(mode="json"))


def _int(args: dict[str, Any], key: str) -> int:
    if key not in args:
        raise ValueError(f"{key} is required")
    return int(args[key])


def _date(args: dict[str, Any], key: str) -> date | None:
    return date.fromisoformat(args[key]) if args.get(key) else None


class ChatTools:
    def __init__(self, session: AsyncSession, user: User) -> None:
        self.session = session
        self.user = user
        self.sources: list[str] = []
        members = MemberRepository(session)
        samities = SamityRepository(session)
        transactions = TransactionRepository(session)
        loans = LoanRepository(session)
        self.members = members
        self.member_service = MemberService(members, samities, UserRepository(session))
        self.transaction_service = TransactionService(transactions, members, loans, samities)
        self.loan_service = LoanService(loans, members, samities, transactions)
        self.bylaw_service = BylawService(
            session, BylawRepository(session), samities, get_embedding_client()
        )

    @property
    def is_customer(self) -> bool:
        return self.user.role == UserRole.CUSTOMER

    def specs(self) -> list[ToolSpec]:
        return [spec for name, spec in SPECS.items() if not (name == "find_members" and self.is_customer)]

    async def own_members(self) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(Member).where(Member.user_id == self.user.id).order_by(Member.id)
        )
        return [
            {"id": m.id, "name": m.name, "member_no": m.member_no, "samity_id": m.samity_id}
            for m in result.scalars().all()
        ]

    async def execute(self, call: ToolCall) -> dict[str, Any]:
        handler = getattr(self, f"_tool_{call.name}", None)
        if call.name not in SPECS or handler is None:
            return {"error": f"Unknown tool {call.name}"}
        try:
            return await handler(call.args)
        except AppError as exc:
            return {"error": exc.detail, "status": exc.status_code}
        except (ValueError, TypeError) as exc:
            return {"error": f"Bad arguments: {exc}"}
        except Exception:
            logger.exception("Chat tool %s failed", call.name)
            return {"error": "This lookup failed; try again later"}

    async def _member(self, member_id: int) -> Member:
        return await get_accessible_member(member_id, self.user, self.session)

    async def _tool_find_members(self, args: dict[str, Any]) -> dict[str, Any]:
        if self.is_customer:
            raise ForbiddenError("Only staff can search members")
        page = await self.member_service.list(
            samity_id=None, member_status=None, q=str(args.get("query", ""))[:100] or None, page=1, size=10
        )
        return {
            "total": page.total,
            "members": [
                {"id": m.id, "name": m.name, "member_no": m.member_no, "samity_id": m.samity_id, "status": m.status}
                for m in page.items
            ],
        }

    async def _tool_get_member(self, args: dict[str, Any]) -> dict[str, Any]:
        m = await self._member(_int(args, "member_id"))
        return {
            "id": m.id,
            "name": m.name,
            "member_no": m.member_no,
            "samity_id": m.samity_id,
            "status": m.status,
            "joined_on": m.joined_on.isoformat(),
        }

    async def _tool_get_balance(self, args: dict[str, Any]) -> dict[str, Any]:
        member = await self._member(_int(args, "member_id"))
        return _dump(await self.transaction_service.balance(member))

    async def _tool_list_transactions(self, args: dict[str, Any]) -> dict[str, Any]:
        member = await self._member(_int(args, "member_id"))
        limit = max(1, min(int(args.get("limit") or 10), 20))
        page = await self.transaction_service.list(
            self.user,
            member_id=member.id,
            date_from=_date(args, "from_date"),
            date_to=_date(args, "to_date"),
            page=1,
            size=limit,
        )
        return _dump(page)

    async def _tool_get_loans(self, args: dict[str, Any]) -> dict[str, Any]:
        member = await self._member(_int(args, "member_id"))
        page = await self.loan_service.list(loan_status=None, member_id=member.id, page=1, size=10)
        return _dump(page)

    async def _tool_get_loan_schedule(self, args: dict[str, Any]) -> dict[str, Any]:
        return _dump(await self.loan_service.schedule(_int(args, "loan_id"), self.user))

    async def _tool_search_bylaws(self, args: dict[str, Any]) -> dict[str, Any]:
        question = str(args.get("question", "")).strip()[:500]
        if len(question) < 2:
            raise ValueError("question is too short")
        samity_id = int(args["samity_id"]) if args.get("samity_id") else None
        if samity_id is None and self.is_customer:
            own = await self.own_members()
            samity_id = own[0]["samity_id"] if own else None
        try:
            result = await self.bylaw_service.search(question, limit=5, samity_id=samity_id)
        except NotFoundError:
            result = await self.bylaw_service.search(question, limit=5)

        hits = []
        for hit in result.hits:
            heading = hit.chunk_text.splitlines()[0]
            if heading not in self.sources:
                self.sources.append(heading)
            hits.append({"clause": heading, "text": hit.chunk_text, "language": hit.source_language})
        if not hits:
            return {"hits": [], "note": "No clause matches this question: the bylaws do not cover it."}
        return {"hits": hits}
"""Samity Khata MCP server: the chat assistant's tools, plus resources and prompts.

Every tool goes through ChatTools, so it runs the same services and permission
checks as the REST API: a customer can only read their own records, and nothing
here can change data.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Any

from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import (
    ResourceError,
    ResourceNotFoundError,
    ToolError,
)
from mcp_types import ToolAnnotations

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.integrations.llm.base import ToolCall
from app.mcp.auth import JwtTokenVerifier, resolve_user
from app.modules.bylaws.repositories import BylawRepository
from app.modules.chat.tools import SPECS, ChatTools

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)

INSTRUCTIONS = """\
Read-only access to a Bangladeshi savings and credit samity: members, savings \
balances, transactions, loans and the samity's bylaws (English and Bangla).
Amounts come in paisa with a "_taka" text next to each; show taka to people.
Call who_am_i first to learn the user's role and their own member ids.
For any question about rules, call search_bylaws and cite the clause numbers; \
if it finds nothing, say the bylaws do not cover it.
"""


def build_server(*, http: bool = False, stdio_user_email: str | None = None) -> MCPServer:
    """http=True requires a bearer token on every request; otherwise the server
    acts as stdio_user_email."""
    settings = get_settings()
    auth_options: dict[str, Any] = {}
    if http:
        auth_options = {
            "token_verifier": JwtTokenVerifier(),
            "auth": AuthSettings(
                issuer_url=settings.MCP_PUBLIC_URL,
                resource_server_url=settings.MCP_PUBLIC_URL,
                validate_token_resource=False,  # our verifier checks the token itself
            ),
        }
    mcp = MCPServer("samity-khata", instructions=INSTRUCTIONS, **auth_options)
    email = None if http else stdio_user_email

    @asynccontextmanager
    async def chat_tools() -> AsyncIterator[ChatTools]:
        async with SessionLocal() as session:
            yield ChatTools(session, await resolve_user(session, email))

    async def run(name: str, **args: Any) -> dict[str, Any]:
        async with chat_tools() as tools:
            result = await tools.execute(
                ToolCall(name, {k: v for k, v in args.items() if v is not None})
            )
        if "error" in result:
            raise ToolError(str(result["error"]))
        return result

    # tools

    def describe(name: str) -> str:
        return SPECS[name].description

    @mcp.tool(annotations=READ_ONLY)
    async def who_am_i() -> dict[str, Any]:
        """The signed-in user: name, role and their own member records."""
        async with chat_tools() as tools:
            return {
                "id": tools.user.id,
                "name": tools.user.name,
                "email": tools.user.email,
                "role": tools.user.role,
                "own_members": await tools.own_members(),
            }

    @mcp.tool(description=describe("find_members"), annotations=READ_ONLY)
    async def find_members(query: str) -> dict[str, Any]:
        return await run("find_members", query=query)

    @mcp.tool(description=describe("get_member"), annotations=READ_ONLY)
    async def get_member(member_id: int) -> dict[str, Any]:
        return await run("get_member", member_id=member_id)

    @mcp.tool(description=describe("get_balance"), annotations=READ_ONLY)
    async def get_balance(member_id: int) -> dict[str, Any]:
        return await run("get_balance", member_id=member_id)

    @mcp.tool(description=describe("list_transactions"), annotations=READ_ONLY)
    async def list_transactions(
        member_id: int,
        from_date: date | None = None,
        to_date: date | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        return await run(
            "list_transactions",
            member_id=member_id,
            from_date=from_date.isoformat() if from_date else None,
            to_date=to_date.isoformat() if to_date else None,
            limit=limit,
        )

    @mcp.tool(description=describe("get_loans"), annotations=READ_ONLY)
    async def get_loans(member_id: int) -> dict[str, Any]:
        return await run("get_loans", member_id=member_id)

    @mcp.tool(description=describe("get_loan_schedule"), annotations=READ_ONLY)
    async def get_loan_schedule(loan_id: int) -> dict[str, Any]:
        return await run("get_loan_schedule", loan_id=loan_id)

    @mcp.tool(description=describe("search_bylaws"), annotations=READ_ONLY)
    async def search_bylaws(question: str, samity_id: int | None = None) -> dict[str, Any]:
        return await run("search_bylaws", question=question, samity_id=samity_id)

    # resources

    def as_json(data: Any) -> str:
        return json.dumps(data, ensure_ascii=False, indent=2, default=str)

    async def resource_run(name: str, **args: Any) -> dict[str, Any]:
        try:
            return await run(name, **args)
        except ToolError as exc:
            raise ResourceError(str(exc)) from None

    @mcp.resource("samity://me", mime_type="application/json")
    async def me() -> str:
        """The signed-in user and their own member records."""
        try:
            return as_json(await who_am_i())
        except ToolError as exc:
            raise ResourceError(str(exc)) from None

    @mcp.resource("samity://members/{member_id}", mime_type="application/json")
    async def member_overview(member_id: int) -> str:
        """A member's details, savings balance and loans in one document."""
        return as_json(
            {
                "member": await resource_run("get_member", member_id=member_id),
                "balance": await resource_run("get_balance", member_id=member_id),
                "loans": await resource_run("get_loans", member_id=member_id),
            }
        )

    @mcp.resource("samity://bylaws", mime_type="application/json")
    async def bylaw_documents() -> str:
        """Every uploaded bylaw document."""
        async with chat_tools() as tools:
            docs = await BylawRepository(tools.session).list_documents()
        return as_json(
            [
                {
                    "id": d.id,
                    "title": d.title,
                    "samity_id": d.samity_id,
                    "chunk_count": d.chunk_count,
                    "uri": f"samity://bylaws/{d.id}",
                }
                for d in docs
            ]
        )

    @mcp.resource("samity://bylaws/{document_id}", mime_type="text/markdown")
    async def bylaw_text(document_id: int) -> str:
        """The full text of one bylaw document, clause by clause."""
        async with chat_tools() as tools:
            repo = BylawRepository(tools.session)
            doc = await repo.get_document(document_id)
            if doc is None:
                raise ResourceNotFoundError(f"Bylaw document {document_id} not found")
            chunks = await repo.chunks_of(document_id)
        return f"# {doc.title}\n\n" + "\n\n".join(c.chunk_text for c in chunks)

    #  prompts

    @mcp.prompt(title="Member summary")
    def member_summary(member_id: int) -> str:
        """Summarise one member's savings, loans and recent activity."""
        return (
            f"Give a short summary of member #{member_id}. Use get_member, get_balance, "
            "get_loans and list_transactions (last 5). Cover: savings balance, unpaid "
            "monthly deposits, any open loan with the amount still owed and the next due "
            "date, and anything that needs attention (overdue loan, missed deposits). "
            "Show amounts in taka."
        )

    @mcp.prompt(title="Explain a bylaw rule")
    def explain_rule(question: str) -> str:
        """Answer a question about the samity's rules from its bylaws."""
        return (
            f"Question: {question}\n\n"
            "Call search_bylaws with this question and answer only from the clauses it "
            "returns, citing each one, e.g. (Clause 3.2) or (ধারা ৩.২). Reply in the "
            "language of the question. If nothing matches, say the bylaws do not cover "
            "it and suggest asking the samity secretary."
        )

    @mcp.prompt(title="Loan eligibility check")
    def loan_eligibility(member_id: int, amount_taka: int) -> str:
        """Check whether a member could get a loan of a given size."""
        return (
            f"Could member #{member_id} get a loan of Tk {amount_taka:,}? Use get_member, "
            "get_balance (loan_ceiling) and get_loans, and search_bylaws for the loan "
            "eligibility rules (membership period, regular deposits, no open loan, "
            "ceiling). Say yes or no, give each reason with its clause, and state the "
            "largest amount they could borrow now. Do not promise approval: the "
            "committee decides."
        )

    return mcp
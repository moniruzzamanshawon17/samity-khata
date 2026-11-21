from collections.abc import Sequence
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.schemas import Page
from app.modules.auth.models import User, UserRole
from app.modules.members.models import Member, MemberStatus
from app.modules.members.repositories import MemberRepository
from app.modules.transactions.models import Transaction, TransactionType
from app.modules.transactions.repositories import TransactionRepository
from app.modules.transactions.schemas import BalanceRead, TransactionCreate, TransactionRead

ALREADY_REVERSED = "This transaction has already been reversed"


class TransactionService:
    def __init__(self, repo: TransactionRepository, members: MemberRepository) -> None:
        self.repo = repo
        self.members = members

    async def record(self, data: TransactionCreate, recorded_by: User) -> Transaction:
        member = await self.repo.lock_member(data.member_id)
        if member is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
        if member.status != MemberStatus.ACTIVE:
            raise HTTPException(422, "Cannot record a transaction for an inactive member")

        if data.type == TransactionType.WITHDRAWAL:
            await self._ensure_savings_cover(member, data.amount_paisa)

        return await self.repo.save(
            Transaction(
                member_id=member.id,
                type=data.type,
                amount_paisa=data.amount_paisa,
                occurred_on=data.occurred_on,
                recorded_by=recorded_by.id,
            )
        )

    async def reverse(self, transaction_id: int, recorded_by: User) -> Transaction:
        original = await self.repo.get(transaction_id)
        if original is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
        if original.type == TransactionType.REVERSAL:
            raise HTTPException(422, "A reversal cannot itself be reversed")

        member = await self.repo.lock_member(original.member_id)
        if await self.repo.get_reversal_of(original.id) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, ALREADY_REVERSED)
        if original.type == TransactionType.DEPOSIT:
            # Taking a deposit back out must not leave the savings negative.
            await self._ensure_savings_cover(member, original.amount_paisa)

        try:
            return await self.repo.save(
                Transaction(
                    member_id=original.member_id,
                    type=TransactionType.REVERSAL,
                    amount_paisa=original.amount_paisa,
                    occurred_on=date.today(),
                    recorded_by=recorded_by.id,
                    reverses_id=original.id,
                )
            )
        except IntegrityError:
            # reverses_id is unique: another request reversed it at the same moment.
            raise HTTPException(status.HTTP_409_CONFLICT, ALREADY_REVERSED) from None

    async def list(
        self,
        user: User,
        *,
        member_id: int | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        size: int,
    ) -> Page[TransactionRead]:
        if date_from and date_to and date_from > date_to:
            raise HTTPException(422, "'from' must be on or before 'to'")

        member_ids = await self._visible_member_ids(user, member_id)
        rows, total = await self.repo.list(
            member_ids=member_ids,
            date_from=date_from,
            date_to=date_to,
            offset=(page - 1) * size,
            limit=size,
        )
        items = [
            TransactionRead.model_validate(tx).model_copy(update={"reversed_by_id": reversed_by})
            for tx, reversed_by in rows
        ]
        return Page(items=items, total=total, page=page, size=size)

    async def balance(self, member: Member) -> BalanceRead:
        totals = await self.repo.totals(member.id)
        return BalanceRead(
            member_id=member.id,
            total_deposits_paisa=totals.deposits,
            total_withdrawals_paisa=totals.withdrawals,
            total_repayments_paisa=totals.repayments,
            savings_balance_paisa=totals.savings,
        )

    async def _visible_member_ids(
        self, user: User, member_id: int | None
    ) -> Sequence[int] | None:
        """Which members' transactions the caller may list. None means all."""
        if user.role != UserRole.CUSTOMER:
            return [member_id] if member_id is not None else None

        own_ids = await self.repo.member_ids_for_user(user.id)
        if member_id is None:
            return own_ids
        if member_id not in own_ids:
            if await self.members.get(member_id) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "You can only view your own transactions"
            )
        return [member_id]

    async def _ensure_savings_cover(self, member: Member, amount_paisa: int) -> None:
        totals = await self.repo.totals(member.id)
        if amount_paisa > totals.savings:
            raise HTTPException(
                422,
                f"Insufficient balance: savings are {totals.savings} paisa",
            )
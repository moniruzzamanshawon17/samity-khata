from collections.abc import Sequence
from datetime import date
from typing import NamedTuple

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.modules.members.models import Member
from app.modules.transactions.models import Transaction, TransactionType


class Totals(NamedTuple):
    deposits: int
    withdrawals: int
    repayments: int

    @property
    def savings(self) -> int:
        return self.deposits - self.withdrawals


class TransactionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, transaction_id: int) -> Transaction | None:
        return await self.session.get(Transaction, transaction_id)

    async def get_reversal_of(self, transaction_id: int) -> Transaction | None:
        result = await self.session.execute(
            select(Transaction).where(Transaction.reverses_id == transaction_id)
        )
        return result.scalar_one_or_none()

    async def lock_member(self, member_id: int) -> Member | None:
        """Lock the member row until commit, so two withdrawals for the same
        member can't both pass the balance check at the same time."""
        result = await self.session.execute(
            select(Member).where(Member.id == member_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def totals(self, member_id: int) -> Totals:
        """Sum every transaction by type. A reversal counts against the type of
        the transaction it reverses."""
        original = aliased(Transaction)
        effective_type = func.coalesce(original.type, Transaction.type)
        signed_amount = case(
            (Transaction.type == TransactionType.REVERSAL, -Transaction.amount_paisa),
            else_=Transaction.amount_paisa,
        )

        def total_for(tx_type: TransactionType):
            return func.coalesce(
                func.sum(case((effective_type == tx_type, signed_amount), else_=0)), 0
            )

        row = (
            await self.session.execute(
                select(
                    total_for(TransactionType.DEPOSIT),
                    total_for(TransactionType.WITHDRAWAL),
                    total_for(TransactionType.REPAYMENT),
                )
                .select_from(Transaction)
                .outerjoin(original, Transaction.reverses_id == original.id)
                .where(Transaction.member_id == member_id)
            )
        ).one()
        return Totals(int(row[0]), int(row[1]), int(row[2]))

    async def list(
        self,
        *,
        member_ids: Sequence[int] | None,
        date_from: date | None,
        date_to: date | None,
        offset: int,
        limit: int,
    ) -> tuple[list[tuple[Transaction, int | None]], int]:
        """Returns (transaction, id of its reversal or None) pairs and the total count.
        `member_ids=None` means every member."""
        conditions = []
        if member_ids is not None:
            conditions.append(Transaction.member_id.in_(member_ids))
        if date_from is not None:
            conditions.append(Transaction.occurred_on >= date_from)
        if date_to is not None:
            conditions.append(Transaction.occurred_on <= date_to)

        total = await self.session.scalar(
            select(func.count()).select_from(Transaction).where(*conditions)
        )

        reversal = aliased(Transaction)
        result = await self.session.execute(
            select(Transaction, reversal.id)
            .outerjoin(reversal, reversal.reverses_id == Transaction.id)
            .where(*conditions)
            .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [(tx, reversed_by) for tx, reversed_by in result.all()], total or 0

    async def last_withdrawal_on(self, member_id: int) -> date | None:
        """Date of the member's latest withdrawal that wasn't reversed."""
        reversal = aliased(Transaction)
        return await self.session.scalar(
            select(func.max(Transaction.occurred_on))
            .outerjoin(reversal, reversal.reverses_id == Transaction.id)
            .where(
                Transaction.member_id == member_id,
                Transaction.type == TransactionType.WITHDRAWAL,
                reversal.id.is_(None),
            )
        )

    async def member_ids_for_user(self, user_id: int) -> Sequence[int]:
        result = await self.session.execute(
            select(Member.id).where(Member.user_id == user_id)
        )
        return result.scalars().all()

    async def save(self, transaction: Transaction) -> Transaction:
        """Raises IntegrityError if a constraint is violated."""
        self.session.add(transaction)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(transaction)
        return transaction
from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.modules.loans.calculations import Payment
from app.modules.loans.models import OPEN_STATUSES, Loan, LoanStatus
from app.modules.transactions.models import Transaction, TransactionType


class LoanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, loan_id: int) -> Loan | None:
        return await self.session.get(Loan, loan_id)

    async def get_for_update(self, loan_id: int) -> Loan | None:
        result = await self.session.execute(
            select(Loan).where(Loan.id == loan_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_open_for_member(self, member_id: int) -> Loan | None:
        result = await self.session.execute(
            select(Loan).where(Loan.member_id == member_id, Loan.status.in_(OPEN_STATUSES))
        )
        return result.scalar_one_or_none()

    async def open_loans(self) -> Sequence[Loan]:
        result = await self.session.execute(select(Loan).where(Loan.status.in_(OPEN_STATUSES)))
        return result.scalars().all()

    async def list(
        self,
        *,
        status: LoanStatus | None,
        member_id: int | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Loan], int]:
        conditions = []
        if status is not None:
            conditions.append(Loan.status == status)
        if member_id is not None:
            conditions.append(Loan.member_id == member_id)

        total = await self.session.scalar(select(func.count()).select_from(Loan).where(*conditions))
        result = await self.session.execute(
            select(Loan).where(*conditions).order_by(Loan.id.desc()).offset(offset).limit(limit)
        )
        return result.scalars().all(), total or 0

    async def payments(self, loan_ids: Sequence[int]) -> dict[int, list[Payment]]:
        """Repayments per loan, leaving out any that were reversed."""
        if not loan_ids:
            return {}
        reversal = aliased(Transaction)
        result = await self.session.execute(
            select(Transaction.loan_id, Transaction.occurred_on, Transaction.amount_paisa)
            .outerjoin(reversal, reversal.reverses_id == Transaction.id)
            .where(
                Transaction.loan_id.in_(loan_ids),
                Transaction.type == TransactionType.REPAYMENT,
                reversal.id.is_(None),
            )
            .order_by(Transaction.occurred_on, Transaction.id)
        )
        by_loan: dict[int, list[Payment]] = defaultdict(list)
        for loan_id, occurred_on, amount in result.all():
            by_loan[loan_id].append(Payment(occurred_on, amount))
        return dict(by_loan)

    async def commit(self) -> None:
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def save(self, loan: Loan) -> Loan:
        """Raises IntegrityError if a constraint is violated."""
        self.session.add(loan)
        await self.commit()
        await self.session.refresh(loan)
        return loan

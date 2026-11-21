from collections.abc import Sequence

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

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

    async def repaid_totals(self, loan_ids: Sequence[int]) -> dict[int, int]:
        """Net repayments per loan: repayments minus reversals of repayments."""
        if not loan_ids:
            return {}
        signed = case(
            (Transaction.type == TransactionType.REVERSAL, -Transaction.amount_paisa),
            else_=Transaction.amount_paisa,
        )
        result = await self.session.execute(
            select(Transaction.loan_id, func.sum(signed))
            .where(Transaction.loan_id.in_(loan_ids))
            .group_by(Transaction.loan_id)
        )
        return {loan_id: int(total) for loan_id, total in result.all()}

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
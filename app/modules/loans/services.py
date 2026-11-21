from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.schemas import Page
from app.modules.auth.models import User, UserRole
from app.modules.loans.calculations import LoanFigures, loan_figures, status_for
from app.modules.loans.models import Loan, LoanStatus
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.schemas import LoanCreate, LoanRead
from app.modules.members.models import MemberStatus
from app.modules.members.repositories import MemberRepository

OPEN_LOAN_EXISTS = "This member already has an open loan"


def figures_for(loan: Loan, repaid_paisa: int, as_of: date | None = None) -> LoanFigures:
    """A closed loan stops accruing interest on the day it closed."""
    if as_of is None:
        as_of = loan.closed_on if loan.closed_on else date.today()
    return loan_figures(
        principal_paisa=loan.principal_paisa,
        annual_rate_bp=loan.annual_rate_bp,
        instalment_paisa=loan.instalment_paisa,
        start_on=loan.start_on,
        repaid_paisa=repaid_paisa,
        as_of=as_of,
    )


def sync_status(loan: Loan, repaid_paisa: int, today: date | None = None) -> bool:
    """Set the loan's status from its figures. Returns True if it changed.

    Closes a loan once nothing is owed, marks it overdue when repayments fall
    behind the instalments due, and reopens a closed loan if a repayment on it
    was reversed.
    """
    today = today or date.today()
    before = (loan.status, loan.closed_on)

    if loan.status == LoanStatus.CLOSED:
        if figures_for(loan, repaid_paisa).outstanding_paisa == 0:
            return False

    new_status = status_for(figures_for(loan, repaid_paisa, as_of=today))
    loan.status = new_status
    loan.closed_on = today if new_status == LoanStatus.CLOSED else None
    return (loan.status, loan.closed_on) != before


def to_read(loan: Loan, repaid_paisa: int) -> LoanRead:
    figures = figures_for(loan, repaid_paisa)
    return LoanRead(
        id=loan.id,
        member_id=loan.member_id,
        principal_paisa=loan.principal_paisa,
        annual_rate_bp=loan.annual_rate_bp,
        instalment_paisa=loan.instalment_paisa,
        start_on=loan.start_on,
        status=loan.status,
        closed_on=loan.closed_on,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
        months_elapsed=figures.months_elapsed,
        interest_paisa=figures.interest_paisa,
        total_payable_paisa=figures.total_payable_paisa,
        repaid_paisa=figures.repaid_paisa,
        outstanding_paisa=figures.outstanding_paisa,
        due_so_far_paisa=figures.due_so_far_paisa,
    )


class LoanService:
    def __init__(self, repo: LoanRepository, members: MemberRepository) -> None:
        self.repo = repo
        self.members = members

    async def create(self, data: LoanCreate) -> LoanRead:
        member = await self.members.get(data.member_id)
        if member is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
        if member.status != MemberStatus.ACTIVE:
            raise HTTPException(422, "Cannot give a loan to an inactive member")
        if await self.repo.get_open_for_member(member.id) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, OPEN_LOAN_EXISTS)

        loan = Loan(**data.model_dump(), status=LoanStatus.ACTIVE)
        sync_status(loan, repaid_paisa=0)  # a back-dated loan may already be overdue
        try:
            loan = await self.repo.save(loan)
        except IntegrityError:
            raise HTTPException(status.HTTP_409_CONFLICT, OPEN_LOAN_EXISTS) from None
        return to_read(loan, 0)

    async def list(
        self,
        *,
        loan_status: LoanStatus | None,
        member_id: int | None,
        page: int,
        size: int,
    ) -> Page[LoanRead]:
        await self.refresh_statuses()
        loans, total = await self.repo.list(
            status=loan_status, member_id=member_id, offset=(page - 1) * size, limit=size
        )
        repaid = await self.repo.repaid_totals([loan.id for loan in loans])
        return Page(
            items=[to_read(loan, repaid.get(loan.id, 0)) for loan in loans],
            total=total,
            page=page,
            size=size,
        )

    async def get(self, loan_id: int, user: User) -> LoanRead:
        loan = await self.repo.get(loan_id)
        if loan is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
        if user.role == UserRole.CUSTOMER:
            member = await self.members.get(loan.member_id)
            if member is None or member.user_id != user.id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own loans")

        repaid = (await self.repo.repaid_totals([loan.id])).get(loan.id, 0)
        if sync_status(loan, repaid):
            await self.repo.commit()
        return to_read(loan, repaid)

    async def refresh_statuses(self) -> None:
        """Bring every open loan's active/overdue/closed status up to date."""
        loans = await self.repo.open_loans()
        repaid = await self.repo.repaid_totals([loan.id for loan in loans])
        changed = [loan for loan in loans if sync_status(loan, repaid.get(loan.id, 0))]
        if changed:
            await self.repo.commit()
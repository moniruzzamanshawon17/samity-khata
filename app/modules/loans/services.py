from datetime import date

from sqlalchemy.exc import IntegrityError

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnprocessableError,
)
from app.core.schemas import Page
from app.modules.auth.models import User, UserRole
from app.modules.loans import bylaw_rules as rules
from app.modules.loans.calculations import (
    LoanPosition,
    Payment,
    full_months_between,
    loan_position,
)
from app.modules.loans.models import Loan, LoanStatus
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.schemas import LoanCreate, LoanRead, LoanSchedule, ScheduleRow
from app.modules.members.models import Member, MemberStatus
from app.modules.members.repositories import MemberRepository
from app.modules.samities.repositories import SamityRepository
from app.modules.transactions.repositories import TransactionRepository

OPEN_LOAN_EXISTS = "This member already has an open loan (Clause 4.1c)"


def position_of(loan: Loan, payments: list[Payment], as_of: date | None = None) -> LoanPosition:
    return loan_position(
        principal_paisa=loan.principal_paisa,
        annual_rate_bp=loan.annual_rate_bp,
        instalment_paisa=loan.instalment_paisa,
        disbursed_on=loan.start_on,
        payments=payments,
        as_of=as_of or date.today(),
    )


def sync_status(loan: Loan, payments: list[Payment]) -> bool:
    """Set status and closed_on from the ledger. Returns True if either changed."""
    position = position_of(loan, payments)
    before = (loan.status, loan.closed_on)
    loan.status = position.status
    loan.closed_on = position.closed_on
    return (loan.status, loan.closed_on) != before


def to_read(loan: Loan, payments: list[Payment]) -> LoanRead:
    p = position_of(loan, payments)
    return LoanRead(
        id=loan.id,
        member_id=loan.member_id,
        principal_paisa=loan.principal_paisa,
        annual_rate_bp=loan.annual_rate_bp,
        term_months=loan.term_months,
        instalment_paisa=loan.instalment_paisa,
        start_on=loan.start_on,
        status=loan.status,
        closed_on=loan.closed_on,
        created_at=loan.created_at,
        updated_at=loan.updated_at,
        principal_outstanding_paisa=p.principal_outstanding_paisa,
        interest_charged_paisa=p.interest_charged_paisa,
        interest_due_paisa=p.interest_due_paisa,
        repaid_paisa=p.repaid_paisa,
        outstanding_paisa=p.outstanding_paisa,
        due_now_paisa=p.due_now_paisa,
        next_due_on=p.next_due_on,
    )


class LoanService:
    def __init__(
        self,
        repo: LoanRepository,
        members: MemberRepository,
        samities: SamityRepository,
        transactions: TransactionRepository,
    ) -> None:
        self.repo = repo
        self.members = members
        self.samities = samities
        self.transactions = transactions

    async def create(self, data: LoanCreate) -> LoanRead:
        member = await self.members.get(data.member_id)
        if member is None:
            raise NotFoundError("Member not found")
        await self._check_eligible(member, data)

        loan = Loan(
            member_id=member.id,
            principal_paisa=data.principal_paisa,
            annual_rate_bp=rules.ANNUAL_RATE_BP,
            term_months=data.term_months,
            instalment_paisa=rules.instalment_amount(data.principal_paisa, data.term_months),
            start_on=data.start_on,
            status=LoanStatus.ACTIVE,
        )
        sync_status(loan, [])  # a back-dated loan may already be overdue
        try:
            loan = await self.repo.save(loan)
        except IntegrityError:
            raise ConflictError(OPEN_LOAN_EXISTS) from None
        return to_read(loan, [])

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
        payments = await self.repo.payments([loan.id for loan in loans])
        return Page(
            items=[to_read(loan, payments.get(loan.id, [])) for loan in loans],
            total=total,
            page=page,
            size=size,
        )

    async def get(self, loan_id: int, user: User) -> LoanRead:
        loan = await self._get_visible(loan_id, user)
        payments = (await self.repo.payments([loan.id])).get(loan.id, [])
        if sync_status(loan, payments):
            await self.repo.commit()
        return to_read(loan, payments)

    async def schedule(self, loan_id: int, user: User) -> LoanSchedule:
        """The planned repayment schedule (Clauses 4.7-4.8), as if paid on time."""
        loan = await self._get_visible(loan_id, user)
        rows = rules.repayment_schedule(loan.principal_paisa, loan.term_months, loan.annual_rate_bp)
        due_dates = rules.instalment_due_dates(loan.start_on, len(rows))
        return LoanSchedule(
            loan_id=loan.id,
            instalment_paisa=loan.instalment_paisa,
            total_interest_paisa=sum(row.interest_paisa for row in rows),
            rows=[
                ScheduleRow(
                    month=row.month,
                    due_on=due_on,
                    payment_paisa=row.payment_paisa,
                    interest_paisa=row.interest_paisa,
                    principal_paisa=row.principal_paisa,
                    balance_after_paisa=row.balance_after_paisa,
                )
                for row, due_on in zip(rows, due_dates)
            ],
        )

    async def refresh_statuses(self) -> None:
        """Bring every open loan's active/overdue/closed status up to date."""
        loans = await self.repo.open_loans()
        payments = await self.repo.payments([loan.id for loan in loans])
        if any([sync_status(loan, payments.get(loan.id, [])) for loan in loans]):
            await self.repo.commit()

    async def _get_visible(self, loan_id: int, user: User) -> Loan:
        loan = await self.repo.get(loan_id)
        if loan is None:
            raise NotFoundError("Loan not found")
        if user.role == UserRole.CUSTOMER:
            member = await self.members.get(loan.member_id)
            if member is None or member.user_id != user.id:
                raise ForbiddenError("You can only view your own loans")
        return loan

    async def _check_eligible(self, member: Member, data: LoanCreate) -> None:
        """Clauses 4.1 and 4.2. Guarantor rules (4.1d) and the share limit (4.2b) are
        not checked, because guarantors and share capital are not recorded."""
        if member.status != MemberStatus.ACTIVE:
            raise UnprocessableError("Inactive members cannot get a loan (Clause 2.4)")
        if await self.repo.get_open_for_member(member.id) is not None:
            raise ConflictError(OPEN_LOAN_EXISTS)

        months = full_months_between(member.joined_on, data.start_on)
        if months < rules.LOAN_MIN_MEMBERSHIP_MONTHS:
            raise UnprocessableError(
                f"A member needs {rules.LOAN_MIN_MEMBERSHIP_MONTHS} months of membership "
                f"before a loan; this member has {months} (Clause 4.1a)"
            )

        samity = await self.samities.get(member.samity_id)
        totals = await self.transactions.totals(member.id)
        unpaid = rules.unpaid_deposits(
            member.joined_on, date.today(), totals.deposits, samity.monthly_deposit_paisa
        )
        if unpaid > 0:
            raise UnprocessableError(
                f"The member has {unpaid} unpaid monthly deposit(s) (Clause 4.1b)"
            )

        ceiling = rules.loan_ceiling(totals.savings, None)
        if data.principal_paisa > ceiling:
            raise UnprocessableError(
                f"The most this member can borrow is {ceiling} paisa: "
                f"3x savings or Tk 50,000, whichever is lower (Clause 4.2)"
            )

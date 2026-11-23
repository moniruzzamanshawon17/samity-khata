from __future__ import annotations

from collections.abc import Sequence
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
from app.modules.loans.calculations import Payment
from app.modules.loans.models import Loan, LoanStatus
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.services import position_of, sync_status
from app.modules.members.models import Member
from app.modules.members.repositories import MemberRepository
from app.modules.samities.repositories import SamityRepository
from app.modules.transactions.models import Transaction, TransactionType
from app.modules.transactions.repositories import TransactionRepository
from app.modules.transactions.schemas import (
    BalanceRead,
    TransactionCreate,
    TransactionRead,
)

ALREADY_REVERSED = "This transaction has already been reversed"


class TransactionService:
    def __init__(
        self,
        repo: TransactionRepository,
        members: MemberRepository,
        loans: LoanRepository,
        samities: SamityRepository,
    ) -> None:
        self.repo = repo
        self.members = members
        self.loans = loans
        self.samities = samities

    async def record(self, data: TransactionCreate, recorded_by: User) -> Transaction:
        member = await self.repo.lock_member(data.member_id)
        if member is None:
            raise NotFoundError("Member not found")

        if data.type == TransactionType.WITHDRAWAL:
            if recorded_by.role != UserRole.ADMIN:
                raise ForbiddenError("Collectors cannot record withdrawals (Clause 6.2)")
            await self._check_withdrawal(member, data.amount_paisa, data.occurred_on)
        if data.type == TransactionType.REPAYMENT:
            await self._apply_repayment(
                data.loan_id, member, data.amount_paisa, data.occurred_on
            )

        # Saving commits the transaction and any loan status change together.
        return await self.repo.save(
            Transaction(
                member_id=member.id,
                type=data.type,
                amount_paisa=data.amount_paisa,
                occurred_on=data.occurred_on,
                recorded_by=recorded_by.id,
                loan_id=data.loan_id,
            )
        )

    async def reverse(self, transaction_id: int, recorded_by: User) -> Transaction:
        original = await self.repo.get(transaction_id)
        if original is None:
            raise NotFoundError("Transaction not found")
        if original.type == TransactionType.REVERSAL:
            raise UnprocessableError("A reversal cannot itself be reversed")

        member = await self.repo.lock_member(original.member_id)
        if await self.repo.get_reversal_of(original.id) is not None:
            raise ConflictError(ALREADY_REVERSED)
        if original.type == TransactionType.DEPOSIT:
            # Taking a deposit back out must not leave the savings negative.
            await self._ensure_savings_cover(member, original.amount_paisa)
        if original.type == TransactionType.REPAYMENT and original.loan_id is not None:
            # Undoing a repayment raises what's owed, and may reopen a closed loan.
            loan = await self.loans.get_for_update(original.loan_id)
            payments = await self._payments(loan)
            payments.remove(Payment(original.occurred_on, original.amount_paisa))
            sync_status(loan, payments)

        try:
            return await self.repo.save(
                Transaction(
                    member_id=original.member_id,
                    type=TransactionType.REVERSAL,
                    amount_paisa=original.amount_paisa,
                    occurred_on=date.today(),
                    recorded_by=recorded_by.id,
                    loan_id=original.loan_id,
                    reverses_id=original.id,
                )
            )
        except IntegrityError:
            # reverses_id is unique: another request reversed it at the same moment.
            raise ConflictError(ALREADY_REVERSED) from None

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
            raise UnprocessableError("'from' must be on or before 'to'")

        member_ids = await self._visible_member_ids(user, member_id)
        rows, total = await self.repo.list(
            member_ids=member_ids,
            date_from=date_from,
            date_to=date_to,
            offset=(page - 1) * size,
            limit=size,
        )
        items = [
            TransactionRead.model_validate(tx).model_copy(
                update={"reversed_by_id": reversed_by}
            )
            for tx, reversed_by in rows
        ]
        return Page(items=items, total=total, page=page, size=size)

    async def balance(self, member: Member) -> BalanceRead:
        totals = await self.repo.totals(member.id)
        samity = await self.samities.get(member.samity_id)
        unpaid = rules.unpaid_deposits(
            member.joined_on, date.today(), totals.deposits, samity.monthly_deposit_paisa
        )
        return BalanceRead(
            member_id=member.id,
            total_deposits_paisa=totals.deposits,
            total_withdrawals_paisa=totals.withdrawals,
            total_repayments_paisa=totals.repayments,
            savings_balance_paisa=totals.savings,
            monthly_deposit_paisa=samity.monthly_deposit_paisa,
            unpaid_deposits=unpaid,
            bylaw_status=rules.member_status(unpaid),
            max_withdrawal_paisa=rules.max_withdrawal(
                totals.savings, await self._open_loan_principal(member)
            ),
            loan_ceiling_paisa=rules.loan_ceiling(totals.savings, None),
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
                raise NotFoundError("Member not found")
            raise ForbiddenError("You can only view your own transactions")
        return [member_id]

    async def _apply_repayment(
        self, loan_id: int, member: Member, amount_paisa: int, paid_on: date
    ) -> None:
        loan = await self.loans.get_for_update(loan_id)
        if loan is None:
            raise NotFoundError("Loan not found")
        if loan.member_id != member.id:
            raise UnprocessableError("This loan belongs to another member")
        if loan.status == LoanStatus.CLOSED:
            raise UnprocessableError("This loan is already fully repaid")
        if paid_on < loan.start_on:
            raise UnprocessableError("A repayment cannot be dated before the loan started")

        payments = await self._payments(loan)
        with_new = payments + [Payment(paid_on, amount_paisa)]
        if position_of(loan, with_new).excess_paisa > 0:
            owed = position_of(loan, payments).outstanding_paisa
            raise UnprocessableError(
                f"Repayment is more than the {owed} paisa needed to close the loan"
            )
        sync_status(loan, with_new)

    async def _check_withdrawal(self, member: Member, amount_paisa: int, on: date) -> None:
        """Clause 3.5: at most 50% of savings, keep a third of any loan principal,
        and only once in any 12 months. The 15-day notice is not tracked."""
        totals = await self.repo.totals(member.id)
        limit = rules.max_withdrawal(totals.savings, await self._open_loan_principal(member))
        if amount_paisa > limit:
            raise UnprocessableError(
                f"At most {limit} paisa can be withdrawn now (Clause 3.5)"
            )
        last = await self.repo.last_withdrawal_on(member.id)
        if last is not None and abs((on - last).days) < rules.WITHDRAWAL_INTERVAL_DAYS:
            raise UnprocessableError(
                f"Only one withdrawal is allowed in any 12 months; the last was on {last} (Clause 3.5)"
            )

    async def _open_loan_principal(self, member: Member) -> int:
        loan = await self.loans.get_open_for_member(member.id)
        if loan is None:
            return 0
        return position_of(loan, await self._payments(loan)).principal_outstanding_paisa

    async def _payments(self, loan: Loan) -> list[Payment]:
        return list((await self.loans.payments([loan.id])).get(loan.id, []))

    async def _ensure_savings_cover(self, member: Member, amount_paisa: int) -> None:
        totals = await self.repo.totals(member.id)
        if amount_paisa > totals.savings:
            raise UnprocessableError(
                f"Insufficient balance: savings are {totals.savings} paisa",
            )
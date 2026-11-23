"""The loan ledger: where a loan stands on a given day, from its repayments.

Follows the bylaw (app/modules/loans/bylaw_rules.py):

- Clause 4.6: on each instalment due date, one month's interest (1%) is charged on
  the principal still outstanding (reducing balance).
- Clause 4.7: each payment covers unpaid interest first, then principal.
- Clause 4.8: due dates fall on the 10th; prepayment reduces principal, so later
  interest is smaller and the loan closes sooner.
- Clause 5.1: overdue when an instalment is unpaid more than 15 days after its due date.

Everything is recomputed from the repayment rows, so a reversed repayment
automatically reopens a loan.
"""

from dataclasses import dataclass
from datetime import date

from app.modules.loans import bylaw_rules as rules
from app.modules.loans.models import LoanStatus


def full_months_between(start: date, end: date) -> int:
    """Whole months from start to end. 21 May -> 21 Nov is 6; 21 May -> 20 Nov is 5."""
    if end <= start:
        return 0
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(months, 0)


@dataclass(frozen=True)
class Payment:
    on: date
    amount_paisa: int


@dataclass(frozen=True)
class LoanPosition:
    principal_outstanding_paisa: int
    interest_charged_paisa: int
    interest_due_paisa: int
    repaid_paisa: int
    outstanding_paisa: int
    due_now_paisa: int
    instalments_due: int
    next_due_on: date | None
    status: LoanStatus
    closed_on: date | None
    excess_paisa: int


def loan_position(
    *,
    principal_paisa: int,
    annual_rate_bp: int,
    instalment_paisa: int,
    disbursed_on: date,
    payments: list[Payment],
    as_of: date,
) -> LoanPosition:
    """Replay interest charges and payments in date order up to as_of.

    excess_paisa is any amount paid beyond what was owed at the time; a valid
    ledger has none.
    """
    pending = sorted((p for p in payments if p.on <= as_of), key=lambda p: p.on)
    principal = principal_paisa
    interest_due = interest_charged = repaid = excess = 0
    due_dates: list[date] = []
    next_due = rules.first_instalment_due(disbursed_on)
    closed_on: date | None = None

    i = 0
    while closed_on is None:
        next_pay = pending[i] if i < len(pending) else None
        # On a shared date the interest is charged before the payment is applied.
        if next_due <= as_of and (next_pay is None or next_due <= next_pay.on):
            interest = rules.monthly_interest(principal, annual_rate_bp)
            interest_due += interest
            interest_charged += interest
            due_dates.append(next_due)
            next_due = rules.add_months(next_due, 1)
        elif next_pay is not None:
            i += 1
            left = next_pay.amount_paisa
            to_interest = min(left, interest_due)
            interest_due -= to_interest
            left -= to_interest
            to_principal = min(left, principal)
            principal -= to_principal
            left -= to_principal
            repaid += next_pay.amount_paisa - left
            excess += left
            if principal == 0 and interest_due == 0:
                closed_on = next_pay.on
        else:
            break
    excess += sum(p.amount_paisa for p in pending[i:])

    outstanding = principal + interest_due
    if closed_on is not None:
        status = LoanStatus.CLOSED
    else:
        overdue_count = sum(1 for d in due_dates if rules.is_overdue((as_of - d).days))
        status = (
            LoanStatus.OVERDUE
            if repaid < overdue_count * instalment_paisa
            else LoanStatus.ACTIVE
        )
    due_now = max(0, min(len(due_dates) * instalment_paisa, repaid + outstanding) - repaid)

    return LoanPosition(
        principal_outstanding_paisa=principal,
        interest_charged_paisa=interest_charged,
        interest_due_paisa=interest_due,
        repaid_paisa=repaid,
        outstanding_paisa=outstanding,
        due_now_paisa=due_now if closed_on is None else 0,
        instalments_due=len(due_dates),
        next_due_on=None if closed_on is not None else next_due,
        status=status,
        closed_on=closed_on,
        excess_paisa=excess,
    )
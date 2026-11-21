"""Loan arithmetic. Pure functions on integers (paisa), so they're easy to test.

Interest is flat on the original principal and accrues once per full month:

    interest = principal x annual_rate_bp x full_months / (12 x 10_000)

annual_rate_bp is in basis points: 1200 means 12% a year. Amounts are
rounded down to whole paisa.
"""

from dataclasses import dataclass
from datetime import date

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
class LoanFigures:
    months_elapsed: int
    interest_paisa: int
    total_payable_paisa: int
    repaid_paisa: int
    outstanding_paisa: int
    due_so_far_paisa: int


def loan_figures(
    *,
    principal_paisa: int,
    annual_rate_bp: int,
    instalment_paisa: int,
    start_on: date,
    repaid_paisa: int,
    as_of: date,
) -> LoanFigures:
    months = full_months_between(start_on, as_of)
    interest = principal_paisa * annual_rate_bp * months // (12 * 10_000)
    total = principal_paisa + interest
    return LoanFigures(
        months_elapsed=months,
        interest_paisa=interest,
        total_payable_paisa=total,
        repaid_paisa=repaid_paisa,
        outstanding_paisa=max(total - repaid_paisa, 0),
        due_so_far_paisa=min(months * instalment_paisa, total),
    )


def status_for(figures: LoanFigures) -> LoanStatus:
    if figures.outstanding_paisa == 0:
        return LoanStatus.CLOSED
    if figures.repaid_paisa < figures.due_so_far_paisa:
        return LoanStatus.OVERDUE
    return LoanStatus.ACTIVE
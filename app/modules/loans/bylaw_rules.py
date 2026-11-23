"""Business rules from the Samity bylaw (data/bylaws/bylaw_en.md).

Every value is in poisha (Tk 1 = 100 poisha) unless named otherwise, and every
function names the clause it implements. If the secretary confirms different
numbers, change them here AND in both bylaw files, then re-ingest the bylaws.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal

TAKA = 100  # poisha per taka

# --- Constants, each tied to a clause -------------------------------------
ADMISSION_FEE_PAISA = 100 * TAKA          # Clause 2.2
SHARE_PRICE_PAISA = 500 * TAKA            # Clause 2.2
MIN_SHARES = 2                            # Clause 2.2
INACTIVE_AFTER_UNPAID_DEPOSITS = 3        # Clause 2.4

MONTHLY_DEPOSIT_PAISA = 500 * TAKA        # Clause 3.1
DEPOSIT_DUE_DAY = 10                      # Clause 3.1
DEPOSIT_FINE_STEP_PAISA = 10 * TAKA       # Clause 3.2
DEPOSIT_FINE_CAP_PAISA = 50 * TAKA        # Clause 3.2

WITHDRAWAL_MAX_PERCENT = 50               # Clause 3.5
WITHDRAWAL_NOTICE_DAYS = 15               # Clause 3.5

LOAN_MIN_MEMBERSHIP_MONTHS = 6            # Clause 4.1
LOAN_SAVINGS_MULTIPLE = 3                 # Clause 4.2(a)
LOAN_SHARE_MULTIPLE = 40                  # Clause 4.2(b), rule 74(1)
LOAN_ABSOLUTE_CAP_PAISA = 50_000 * TAKA   # Clause 4.2(c)
ANNUAL_RATE_BP = 1200                     # Clause 4.6: 12% a year, 1% a month
ALLOWED_TERMS_MONTHS = (6, 12, 18, 24)    # Clause 4.8
INSTALMENT_DUE_DAY = 10                   # Clause 4.8

GRACE_DAYS = 15                           # Clause 5.1
INSTALMENT_FINE_STEP_PAISA = 20 * TAKA    # Clause 5.2
INSTALMENT_FINE_CAP_PAISA = 100 * TAKA    # Clause 5.2
RECOVERY_AFTER_OVERDUE_DAYS = 90          # Clause 5.3

FINE_REPEAT_DAYS = 30                     # Clauses 3.2 and 5.2
FIRST_INSTALMENT_MIN_DAYS = 15            # Clause 4.8
WITHDRAWAL_INTERVAL_DAYS = 365            # Clause 3.5: once in any 12 months


# --- Membership ------------------------------------------------------------
def member_status(unpaid_deposits: int) -> str:
    """Clause 2.4: active, or inactive at 3 or more unpaid monthly deposits."""
    return "inactive" if unpaid_deposits >= INACTIVE_AFTER_UNPAID_DEPOSITS else "active"


# --- Dates ---------------------------------------------------------------------
def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    return date(day.year + month_index // 12, month_index % 12 + 1, day.day)


# --- Deposits ----------------------------------------------------------------
def deposits_due(joined_on: date, as_of: date, due_day: int = DEPOSIT_DUE_DAY) -> int:
    """Clause 3.1: one deposit falls due on the 10th of every month, starting with the
    month of joining (or the next month, if the member joined after the 10th). Counts
    the due dates that have passed by as_of; a deposit is late from the 11th."""
    first = date(joined_on.year, joined_on.month, due_day)
    if joined_on.day > due_day:
        first = add_months(first, 1)
    if as_of <= first:
        return 0
    months = (as_of.year - first.year) * 12 + (as_of.month - first.month)
    return months + (1 if as_of.day > due_day else 0)


def unpaid_deposits(
    joined_on: date, as_of: date, deposits_paisa: int, monthly_deposit_paisa: int = MONTHLY_DEPOSIT_PAISA
) -> int:
    """Clauses 2.4 and 3.1: deposits due so far that the member's savings deposits don't
    cover. Advance deposits count towards later months."""
    paid_months = deposits_paisa // monthly_deposit_paisa
    return max(0, deposits_due(joined_on, as_of) - paid_months)


def late_deposit_fine(days_late: int) -> int:
    """Clause 3.2: Tk 10 on the 11th (1 day late), +Tk 10 per further 30 days, max Tk 50."""
    if days_late <= 0:
        return 0
    steps = 1 + (days_late - 1) // FINE_REPEAT_DAYS
    return min(steps * DEPOSIT_FINE_STEP_PAISA, DEPOSIT_FINE_CAP_PAISA)


def max_withdrawal(savings_paisa: int, outstanding_principal_paisa: int = 0) -> int:
    """Clause 3.5: up to 50% of savings; with a loan, keep >= 1/3 of outstanding principal."""
    limit = savings_paisa * WITHDRAWAL_MAX_PERCENT // 100
    if outstanding_principal_paisa > 0:
        must_keep = -(-outstanding_principal_paisa // 3)  # ceiling division
        limit = min(limit, max(0, savings_paisa - must_keep))
    return limit


# --- Loans -------------------------------------------------------------------
def loan_ceiling(savings_paisa: int, paid_up_shares_paisa: int | None) -> int:
    """Clause 4.2: lowest of 3x savings, 40x paid-up shares, Tk 50,000.

    Pass None for shares when share capital isn't recorded; the share limit is then skipped.
    """
    limits = [savings_paisa * LOAN_SAVINGS_MULTIPLE, LOAN_ABSOLUTE_CAP_PAISA]
    if paid_up_shares_paisa is not None:
        limits.append(paid_up_shares_paisa * LOAN_SHARE_MULTIPLE)
    return min(limits)


def monthly_interest(balance_paisa: int, annual_rate_bp: int = ANNUAL_RATE_BP) -> int:
    """Clause 4.6: reducing-balance interest for one month, nearest poisha, half up."""
    numerator = balance_paisa * annual_rate_bp
    denominator = 12 * 10_000
    return (2 * numerator + denominator) // (2 * denominator)


def instalment_amount(principal_paisa: int, months: int, annual_rate_bp: int = ANNUAL_RATE_BP) -> int:
    """Clause 4.7: A = P*r / (1 - (1+r)^-n), rounded UP to the next whole taka."""
    if months not in ALLOWED_TERMS_MONTHS:
        raise ValueError(f"term must be one of {ALLOWED_TERMS_MONTHS} (Clause 4.8)")
    if principal_paisa <= 0:
        raise ValueError("principal must be positive")
    r = Decimal(annual_rate_bp) / Decimal(12 * 10_000)
    exact = Decimal(principal_paisa) * r / (1 - (1 + r) ** -months)
    taka = (exact / TAKA).to_integral_value(rounding=ROUND_CEILING)
    return int(taka) * TAKA


@dataclass(frozen=True)
class ScheduleRow:
    month: int
    payment_paisa: int
    interest_paisa: int
    principal_paisa: int
    balance_after_paisa: int


def repayment_schedule(principal_paisa: int, months: int, annual_rate_bp: int = ANNUAL_RATE_BP) -> list[ScheduleRow]:
    """Clauses 4.6-4.7: interest first, then principal; last payment clears the balance."""
    payment = instalment_amount(principal_paisa, months, annual_rate_bp)
    balance = principal_paisa
    rows: list[ScheduleRow] = []
    for month in range(1, months + 1):
        interest = monthly_interest(balance, annual_rate_bp)
        if month == months or payment - interest >= balance:
            principal_part = balance
        else:
            principal_part = payment - interest
        balance -= principal_part
        rows.append(ScheduleRow(month, interest + principal_part, interest, principal_part, balance))
        if balance == 0:
            break
    return rows


def first_instalment_due(disbursed_on: date, due_day: int = INSTALMENT_DUE_DAY) -> date:
    """Clause 4.8: instalments fall on the 10th, the first at least 15 days after disbursement."""
    earliest = disbursed_on + timedelta(days=FIRST_INSTALMENT_MIN_DAYS)
    due = date(earliest.year, earliest.month, due_day)
    return due if due >= earliest else add_months(due, 1)


def instalment_due_dates(disbursed_on: date, count: int) -> list[date]:
    """Clause 4.8: the due dates of the first `count` instalments."""
    first = first_instalment_due(disbursed_on)
    return [add_months(first, k) for k in range(count)]


def is_overdue(days_since_due: int) -> bool:
    """Clause 5.1: overdue when an instalment is unpaid more than 15 days after its due date."""
    return days_since_due > GRACE_DAYS


def late_instalment_fine(days_since_due: int) -> int:
    """Clause 5.2: Tk 20 on day 16, +Tk 20 per further 30 days, max Tk 100."""
    if not is_overdue(days_since_due):
        return 0
    steps = 1 + (days_since_due - (GRACE_DAYS + 1)) // FINE_REPEAT_DAYS
    return min(steps * INSTALMENT_FINE_STEP_PAISA, INSTALMENT_FINE_CAP_PAISA)
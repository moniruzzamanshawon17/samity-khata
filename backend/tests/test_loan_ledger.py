"""The loan ledger follows the bylaw: Clauses 4.6-4.8 and 5.1."""
from datetime import date, timedelta

from app.modules.loans import bylaw_rules as r
from app.modules.loans.calculations import Payment, loan_position
from app.modules.loans.models import LoanStatus

P = 20_000 * r.TAKA
A = r.instalment_amount(P, 12)
DISBURSED = date(2026, 1, 20)  # first instalment due 2026-02-10 (Clause 4.8)
DUE = r.instalment_due_dates(DISBURSED, 12)


def position(payments, as_of):
    return loan_position(
        principal_paisa=P, annual_rate_bp=r.ANNUAL_RATE_BP, instalment_paisa=A,
        disbursed_on=DISBURSED, payments=payments, as_of=as_of,
    )


def test_first_due_date_is_at_least_15_days_after_disbursement():
    assert DUE[0] == date(2026, 2, 10)
    assert r.first_instalment_due(date(2026, 1, 28)) == date(2026, 3, 10)


def test_paying_on_schedule_matches_the_bylaw_example():
    schedule = r.repayment_schedule(P, 12)
    payments = [Payment(d, row.payment_paisa) for d, row in zip(DUE, schedule)]
    pos = position(payments, DUE[-1])
    assert pos.status == LoanStatus.CLOSED
    assert pos.closed_on == DUE[-1]
    assert pos.interest_charged_paisa == 132_370  # Tk 1,323.70, as in Clause 4.7
    assert pos.repaid_paisa == P + 132_370
    assert pos.excess_paisa == 0


def test_interest_is_charged_on_due_dates_only():
    assert position([], DUE[0] - timedelta(days=1)).interest_charged_paisa == 0
    assert position([], DUE[0]).interest_charged_paisa == 20_000  # 1% of Tk 20,000


def test_overdue_only_after_15_day_grace():
    assert position([], DUE[0] + timedelta(days=15)).status == LoanStatus.ACTIVE
    assert position([], DUE[0] + timedelta(days=16)).status == LoanStatus.OVERDUE


def test_catching_up_returns_to_active():
    late = DUE[0] + timedelta(days=20)
    assert position([Payment(late, A)], late).status == LoanStatus.ACTIVE


def test_prepayment_cuts_interest_and_closes_early():
    early = [Payment(DUE[0], A), Payment(DUE[0] + timedelta(days=1), 10_000 * r.TAKA)]
    on_schedule = position([Payment(d, A) for d in DUE[:6]], DUE[5])
    prepaid = position(early + [Payment(d, A) for d in DUE[1:6]], DUE[5])
    assert prepaid.interest_charged_paisa < on_schedule.interest_charged_paisa
    assert prepaid.status == LoanStatus.CLOSED


def test_paying_more_than_owed_is_excess():
    pos = position([Payment(DISBURSED, P + 1)], DISBURSED)
    assert pos.excess_paisa == 1 and pos.status == LoanStatus.CLOSED


def test_deposits_due_and_unpaid():
    assert r.deposits_due(date(2026, 1, 5), date(2026, 3, 10)) == 2
    assert r.deposits_due(date(2026, 1, 5), date(2026, 3, 11)) == 3
    assert r.deposits_due(date(2026, 1, 15), date(2026, 3, 11)) == 2
    assert r.unpaid_deposits(date(2026, 1, 5), date(2026, 3, 11), 2 * r.MONTHLY_DEPOSIT_PAISA) == 1
    assert r.member_status(r.unpaid_deposits(date(2026, 1, 5), date(2026, 4, 11), 0)) == "inactive"


def test_loan_ceiling_without_shares():
    assert r.loan_ceiling(7_000 * r.TAKA, None) == 21_000 * r.TAKA
    assert r.loan_ceiling(100_000 * r.TAKA, None) == 50_000 * r.TAKA

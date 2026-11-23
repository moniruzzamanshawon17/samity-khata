"""Checks that the code matches the bylaw, and that the bylaw files suit the RAG tests."""
from pathlib import Path

import pytest

from app.modules.bylaws.chunker import chunk_file
from app.modules.loans import bylaw_rules as r

ROOT = Path(__file__).resolve().parents[1]
EN = ROOT / "data" / "bylaws" / "bylaw_en.md"
BN = ROOT / "data" / "bylaws" / "bylaw_bn.md"


# --- Clause 4.7 worked example: Tk 20,000, 12 months, 12% reducing balance ----
def test_instalment_rounds_up_to_whole_taka():
    assert r.instalment_amount(20_000 * r.TAKA, 12) == 1_777 * r.TAKA


def test_schedule_matches_bylaw_example():
    rows = r.repayment_schedule(20_000 * r.TAKA, 12)
    assert len(rows) == 12
    assert rows[0].interest_paisa == 20_000          # Tk 200.00
    assert rows[0].balance_after_paisa == 1_842_300  # Tk 18,423.00
    assert all(row.payment_paisa == 177_700 for row in rows[:11])
    assert rows[-1].payment_paisa == 177_670         # Tk 1,776.70
    assert rows[-1].balance_after_paisa == 0
    total_interest = sum(row.interest_paisa for row in rows)
    assert total_interest == 132_370                 # Tk 1,323.70


def test_term_must_be_allowed():
    with pytest.raises(ValueError):
        r.instalment_amount(10_000 * r.TAKA, 10)


# --- Clause 4.2 ceiling example ----------------------------------------------
def test_loan_ceiling_example():
    assert r.loan_ceiling(7_000 * r.TAKA, 1_000 * r.TAKA) == 21_000 * r.TAKA
    assert r.loan_ceiling(100_000 * r.TAKA, 10_000 * r.TAKA) == 50_000 * r.TAKA


# --- Clauses 3.2, 5.1, 5.2 ----------------------------------------------------
@pytest.mark.parametrize("days, taka", [(0, 0), (1, 10), (30, 10), (31, 20), (200, 50)])
def test_late_deposit_fine(days, taka):
    assert r.late_deposit_fine(days) == taka * r.TAKA


@pytest.mark.parametrize("days, overdue, taka", [(15, False, 0), (16, True, 20), (45, True, 20), (46, True, 40), (400, True, 100)])
def test_overdue_and_instalment_fine(days, overdue, taka):
    assert r.is_overdue(days) is overdue
    assert r.late_instalment_fine(days) == taka * r.TAKA


# --- Clauses 2.4 and 3.5 -----------------------------------------------------
def test_member_status():
    assert r.member_status(2) == "active"
    assert r.member_status(3) == "inactive"


def test_withdrawal_limits():
    assert r.max_withdrawal(10_000 * r.TAKA) == 5_000 * r.TAKA
    # Tk 18,000 principal outstanding: must keep Tk 6,000, so only Tk 4,000 can go
    assert r.max_withdrawal(10_000 * r.TAKA, 18_000 * r.TAKA) == 4_000 * r.TAKA


# --- Bylaw files ready for RAG ----------------------------------------------
def test_both_languages_have_the_same_clauses():
    en = [c.clause for c in chunk_file(EN, "en")]
    bn = [c.clause for c in chunk_file(BN, "bn")]
    assert en == bn
    assert len(en) == 38


def test_chunks_are_small_enough():
    for path, lang in ((EN, "en"), (BN, "bn")):
        for chunk in chunk_file(path, lang):
            assert len(chunk.text) <= 650, (chunk.clause, len(chunk.text))


@pytest.mark.parametrize("word", ["wedding", "marriage", "brother", "chairman", "বিয়ে", "বিবাহ", "ভাই", "চেয়ারম্যান"])
def test_not_in_bylaws_questions_stay_unanswerable(word):
    """The video's 'not in the bylaws' questions must find no matching clause."""
    for path in (EN, BN):
        assert word not in path.read_text(encoding="utf-8").lower()

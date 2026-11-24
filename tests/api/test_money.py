"""Transactions, balance and loans, with the bylaw clause each check comes from."""
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.session import engine
from app.modules.loans import bylaw_rules as rules
from tests.api.conftest import make_member, months_ago, pay_all_deposits


def tx(member_id, kind, amount, **extra):
    return {"member_id": member_id, "type": kind, "amount_paisa": amount, **extra}


async def test_deposit_roles_and_validation(client, users, own):
    assert (await client.post("/transactions", json=tx(own["id"], "deposit", 50000), headers=users.staff)).status_code == 201
    assert (await client.post("/transactions", json=tx(own["id"], "deposit", 50000), headers=users.customer)).status_code == 403
    assert (await client.post("/transactions", json=tx(999, "deposit", 50000), headers=users.staff)).status_code == 404
    assert (await client.post("/transactions", json=tx(own["id"], "deposit", 0), headers=users.staff)).status_code == 422
    assert (await client.post("/transactions", json=tx(own["id"], "deposit", 12.5), headers=users.staff)).status_code == 422
    tomorrow = str(date.today() + timedelta(days=1))
    assert (await client.post("/transactions", json=tx(own["id"], "deposit", 100, occurred_on=tomorrow), headers=users.staff)).status_code == 422
    assert (await client.post("/transactions", json=tx(own["id"], "repayment", 100), headers=users.staff)).status_code == 422  # no loan_id


async def test_balance_follows_the_bylaw(client, users, own, other):
    savings = await pay_all_deposits(client, users, own)
    b = (await client.get(f"/members/{own['id']}/balance", headers=users.customer)).json()
    assert b["savings_balance_paisa"] == savings
    assert b["unpaid_deposits"] == 0 and b["bylaw_status"] == "active"
    assert b["max_withdrawal_paisa"] == savings // 2  # Clause 3.5
    assert b["loan_ceiling_paisa"] == min(3 * savings, rules.LOAN_ABSOLUTE_CAP_PAISA)  # Clause 4.2

    unpaid = (await client.get(f"/members/{other['id']}/balance", headers=users.staff)).json()
    assert unpaid["unpaid_deposits"] >= 3 and unpaid["bylaw_status"] == "inactive"  # Clause 2.4
    assert (await client.get(f"/members/{other['id']}/balance", headers=users.customer)).status_code == 403
    assert (await client.get("/members/999/balance", headers=users.staff)).status_code == 404


async def test_withdrawals(client, users, own):
    savings = await pay_all_deposits(client, users, own)
    w = lambda amount, who: client.post("/transactions", json=tx(own["id"], "withdrawal", amount), headers=who)
    assert (await w(100, users.staff)).status_code == 403  # collectors can't (Clause 6.2)
    assert (await w(savings // 2 + 1, users.admin)).status_code == 422  # over 50% (Clause 3.5)
    assert (await w(savings // 2, users.admin)).status_code == 201
    assert (await w(100, users.admin)).status_code == 422  # once in 12 months (Clause 3.5)


async def test_list_transactions_filters_and_access(client, users, own, other):
    for months, amount in ((3, 100), (2, 200), (1, 300)):
        body = tx(own["id"], "deposit", amount, occurred_on=str(months_ago(months)))
        assert (await client.post("/transactions", json=body, headers=users.staff)).status_code == 201
    await client.post("/transactions", json=tx(other["id"], "deposit", 999), headers=users.staff)

    window = {"member_id": own["id"], "from": str(months_ago(2)), "to": str(months_ago(1))}
    r = (await client.get("/transactions", params=window, headers=users.staff)).json()
    assert [t["amount_paisa"] for t in r["items"]] == [300, 200]  # newest first

    mine = (await client.get("/transactions", headers=users.customer)).json()
    assert mine["total"] == 3  # a customer sees only their own
    assert (await client.get("/transactions", params={"member_id": other["id"]}, headers=users.customer)).status_code == 403


async def test_reversal(client, users, own):
    deposit = (await client.post("/transactions", json=tx(own["id"], "deposit", 50000), headers=users.staff)).json()
    assert (await client.post(f"/transactions/{deposit['id']}/reverse", headers=users.staff)).status_code == 403
    r = await client.post(f"/transactions/{deposit['id']}/reverse", headers=users.admin)
    assert r.status_code == 201 and r.json()["type"] == "reversal" and r.json()["reverses_id"] == deposit["id"]
    assert (await client.post(f"/transactions/{deposit['id']}/reverse", headers=users.admin)).status_code == 409
    assert (await client.post("/transactions/999/reverse", headers=users.admin)).status_code == 404
    b = (await client.get(f"/members/{own['id']}/balance", headers=users.staff)).json()
    assert b["savings_balance_paisa"] == 0


async def test_transactions_are_append_only_in_the_database(client, users, own):
    await client.post("/transactions", json=tx(own["id"], "deposit", 50000), headers=users.staff)
    for sql in ("UPDATE transactions SET amount_paisa = 1", "DELETE FROM transactions"):
        with pytest.raises(DBAPIError):
            async with engine.begin() as conn:
                await conn.execute(text(sql))


async def test_loan_lifecycle(client, users, own):
    savings = await pay_all_deposits(client, users, own)
    ceiling = min(3 * savings, rules.LOAN_ABSOLUTE_CAP_PAISA)
    new = lambda amount, term=12, who=users.admin: client.post(
        "/loans", json={"member_id": own["id"], "principal_paisa": amount, "term_months": term}, headers=who
    )
    assert (await new(10_000, who=users.staff)).status_code == 403
    assert (await new(ceiling + 1)).status_code == 422  # Clause 4.2
    assert (await new(10_000, term=10)).status_code == 422  # Clause 4.8

    r = await new(1_000_000)
    assert r.status_code == 201
    loan = r.json()
    assert loan["annual_rate_bp"] == rules.ANNUAL_RATE_BP  # Clause 4.6
    assert loan["instalment_paisa"] == rules.instalment_amount(1_000_000, 12)  # Clause 4.7
    assert (await new(10_000)).status_code == 409  # one open loan (Clause 4.1c)

    schedule = (await client.get(f"/loans/{loan['id']}/schedule", headers=users.customer)).json()
    assert len(schedule["rows"]) == 12

    owed = loan["outstanding_paisa"]
    pay = lambda amount: client.post(
        "/transactions", json=tx(own["id"], "repayment", amount, loan_id=loan["id"]), headers=users.staff
    )
    assert (await pay(owed + 1)).status_code == 422
    payoff = (await pay(owed)).json()
    assert (await client.get(f"/loans/{loan['id']}", headers=users.customer)).json()["status"] == "closed"

    await client.post(f"/transactions/{payoff['id']}/reverse", headers=users.admin)
    assert (await client.get(f"/loans/{loan['id']}", headers=users.staff)).json()["status"] == "active"


async def test_loan_eligibility(client, users, samity, other):
    # Unpaid deposits (Clause 4.1b)
    body = {"member_id": other["id"], "principal_paisa": 10_000, "term_months": 12}
    assert (await client.post("/loans", json=body, headers=users.admin)).status_code == 422
    # Under 6 months of membership (Clause 4.1a)
    young = await make_member(client, users, samity, "SSR-0099", joined=months_ago(2))
    await pay_all_deposits(client, users, young)
    body = {"member_id": young["id"], "principal_paisa": 10_000, "term_months": 12}
    assert (await client.post("/loans", json=body, headers=users.admin)).status_code == 422
    assert (await client.post("/loans", json=body | {"member_id": 999}, headers=users.admin)).status_code == 404


async def test_list_and_read_loans(client, users, own, other):
    await pay_all_deposits(client, users, own)
    back_dated = {"member_id": own["id"], "principal_paisa": 500_000, "term_months": 6, "start_on": str(months_ago(2))}
    loan = (await client.post("/loans", json=back_dated, headers=users.admin)).json()
    assert loan["status"] == "overdue"  # instalments due and nothing paid (Clause 5.1)

    overdue = (await client.get("/loans", params={"status": "overdue"}, headers=users.staff)).json()
    assert [x["id"] for x in overdue["items"]] == [loan["id"]]
    assert (await client.get("/loans", params={"status": "active"}, headers=users.staff)).json()["total"] == 0
    assert (await client.get("/loans", headers=users.customer)).status_code == 403
    assert (await client.get(f"/loans/{loan['id']}", headers=users.customer)).status_code == 200
    stranger = await client.get(f"/loans/{loan['id']}", headers=users.customer2)
    assert stranger.status_code == 403
    assert (await client.get("/loans/999", headers=users.admin)).status_code == 404
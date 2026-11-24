<!-- Paste this into README.md under a "Bylaws and business rules" heading. -->

## Samity-Khata: bylaws and business rules

The samity's rules come from a sample bilingual bylaw for the fictional
**Shapla Sanchay O Rindan Samabay Samity Ltd**:

- `data/bylaws/bylaw_en.md` (English)
- `data/bylaws/bylaw_bn.md` (Bangla)

Each `####` heading is one clause and one RAG chunk (38 clauses per language, 240 to 470 characters each).
English and Bangla chunks share the same clause id, such as `3.2`. That means a question in either language
returns the same rule. The bylaw is a teaching model and **is not a registered document**.

The values marked "illustrative" below were checked with a real samity secretary: _[name, samity, upazila, date]_.

### Why not the Bangladesh Samabaya Bank bylaw?

The bylaw of Bangladesh Samabaya Bank Ltd (BSBL) was reviewed first and rejected for three reasons:

- BSBL is an apex cooperative bank whose members are other cooperative societies, not individual people.
- It has no rules for monthly deposits, instalments, overdue status, fines or member data access.
- It is a scanned image with no text, so it cannot be ingested.

### Which law applies

A primary savings and credit samity is governed by the following:

- the Cooperative Societies Act 2001, amended in 2002 and 2013
- the Cooperative Societies Rules 2004, amended in 2020
- supervision by the Department of Cooperatives

The MRA's 24% declining-balance interest cap applies only to MRA-certified microcredit organisations. It is used
here only as a benchmark.

### Rule → clause → code

"Enforced" means the API refuses anything that breaks the rule. "Documented only" means the
bylaw states it and `bylaw_rules.py` may have the formula, but the API does not apply it yet.

| Rule | Clause | Value | Status | Where |
|---|---|---|---|---|
| Member number | 2.3 | `SSR-0001`, never reused | Documented only (unique per samity, format not checked) | `members` |
| Active / inactive | 2.4 | inactive at 3 unpaid deposits | Calculated and shown; loans refused | `unpaid_deposits`, `member_status`, `GET /members/{id}/balance` |
| Monthly deposit | 3.1 | Tk 500, due on the 10th | Enforced for loan eligibility | `samities.monthly_deposit_paisa`, `deposits_due` |
| Late deposit fine | 3.2 | Tk 10, then +Tk 10 every 30 days, max Tk 50 | Documented only (no fine entries yet) | `late_deposit_fine` |
| Savings balance | 3.3 | deposits − withdrawals, always calculated | Enforced | `GET /members/{id}/balance` |
| Corrections | 3.4 | reversing entry only, never update or delete | Enforced (API and database trigger) | `POST /transactions/{id}/reverse` |
| Withdrawal | 3.5 | ≤ 50%, once in 12 months; keep ≥ ⅓ of loan principal | Enforced (15-day notice not tracked) | `max_withdrawal` |
| Loan eligibility | 4.1 | 6 months' membership, no unpaid deposits, one open loan | Enforced (guarantor rule 4.1d not tracked) | `LoanService._check_eligible` |
| Loan ceiling | 4.2 | min(3× savings, 40× shares, Tk 50,000) | Enforced without the share limit (shares not recorded) | `loan_ceiling` |
| Interest | 4.6 | 12% a year, reducing balance, 1% a month | Enforced | `monthly_interest`, `loans/calculations.py` |
| Instalment | 4.7 | EMI formula, rounded up to whole taka | Enforced | `instalment_amount`, `GET /loans/{id}/schedule` |
| Terms and due dates | 4.8 | 6, 12, 18 or 24 months, due on the 10th, prepayment allowed | Enforced | `instalment_due_dates`, `loan_position` |
| Overdue | 5.1 | unpaid > 15 days after due date | Enforced (status updates itself) | `is_overdue`, `loan_position` |
| Late instalment fine | 5.2 | Tk 20 on day 16, +Tk 20 every 30 days, max Tk 100 | Documented only (no fine entries yet) | `late_instalment_fine` |
| Admin (secretary) | 6.1 | full write access, reversals | Enforced | role checks |
| Staff (collector) | 6.2 | records deposits and instalments only | Enforced: no withdrawals, loans, members or reversals | role checks |
| Member | 6.3, 6.4 | own records only, 403 for others | Enforced | `AccessibleMember`, loan and transaction checks |
| Not covered | 7.7 | reply "not in the bylaws" | Via the RAG similarity threshold | `RAG_SIMILARITY_THRESHOLD` |

### How a repayment is applied

Interest is charged on each due date (the 10th) at 1% of the principal still outstanding.
A repayment pays unpaid interest first, then principal. Paying early lowers the principal, so
later interest is smaller and the loan closes sooner (Clause 4.8). Everything is recalculated
from the repayment rows, so reversing a repayment reopens the loan. A loan is overdue when the
total repaid is less than the instalments whose due date passed more than 15 days ago.

### Loading the bylaws

Each `####` heading becomes one chunk. Load both languages for the same samity:

```powershell
docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_en.md --samity-id 1
docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_bn.md --samity-id 1
```

### Worked loan example (Clause 4.7)

The example loan is Tk 20,000 over 12 months at 12% on the reducing balance:

- **Instalment:** 20,000 × 0.01 ÷ (1 − 1.01⁻¹²) = 1,776.98. Rounded up, that is Tk 1,777 (177,700 poisha).
- **Payments:** 11 payments of Tk 1,777, then a last payment of Tk 1,776.70.
- **Total interest:** Tk 1,323.70. A 12% *flat* rate would charge Tk 2,400.

`tests/test_bylaw_rules.py` checks this schedule to the poisha, and `tests/test_loan_ledger.py`
checks that the loan ledger reaches the same Tk 1,323.70 of interest when paid on time.

### Legal basis and illustrative values

| Item | Source |
|---|---|
| No deposits from or loans to non-members (1.3) | Act s.26(1) |
| Shares, one-fifth cap, transfer only (2.2) | Act s.15 |
| Loan ≤ 40× paid-up shares (4.2b) | Rules r.74(1), as quoted by district cooperative offices |
| 25% liquidity (3.6) | Department of Cooperatives guidance (district offices cite 20% or 25%) |
| 15% reserve, 3% Cooperative Development Fund, profit order (7.4) | Act s.34 |
| Committee term, age, AGM, quorum (7.1, 7.3) | Act s.17–19 |
| Audit, disputes, amendment (7.5–7.7) | Act s.43, s.50, s.13 |
| **Illustrative values, to be confirmed by the secretary:** admission fee Tk 100, share Tk 500, deposit Tk 500, due date the 10th, both fines, 12% rate, 15-day grace period, 3× savings, Tk 50,000 cap, withdrawal limits, 6-member committee, 10-year record keeping | Secretary interview |

### RAG test questions

| Question | Expected |
|---|---|
| What is the late-payment rule? | Clause 3.2 (deposit) and/or 5.2 (instalment), quoted |
| দেরিতে জমা দিলে কী হয়? | ধারা ৩.২, answered in Bangla |
| Can I borrow for a wedding? | Not in the bylaws (4.3 lists purposes; weddings are not one) |
| Who is the chairman's brother? | Not in the bylaws, no guess |

A test confirms that the words wedding, marriage, brother and chairman, and their Bangla equivalents, never appear in
either bylaw file. That keeps both "not in the bylaws" answers honest.

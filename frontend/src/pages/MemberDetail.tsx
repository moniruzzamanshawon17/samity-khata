import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Bar, Chip, Loading, Pager, TxChip } from "../components/ui";
import { api, fetchAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBalance, loadSamities } from "../lib/data";
import { dateLabel, initials, monthsBetween, taka } from "../lib/format";
import { paidCount } from "../lib/loan";
import type { Loan, Member, Page, Transaction } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const SIZE = 10;

export function MemberDetail() {
  const { id } = useParams();
  const memberId = Number(id);
  const { is } = useAuth();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"tx" | "loans">("tx");

  const base = useAsync(async () => {
    const [member, balance, loans, samities] = await Promise.all([
      api.get<Member>(`/members/${memberId}`),
      getBalance(memberId),
      fetchAll<Loan>("/loans", { member_id: memberId }),
      loadSamities(),
    ]);
    return { member, balance, loans, samity: samities.find((s) => s.id === member.samity_id) ?? null };
  }, [memberId]);
  const txs = useAsync(() => api.get<Page<Transaction>>("/transactions", { member_id: memberId, page, size: SIZE }), [memberId, page]);

  if (base.loading) return <Loading />;
  if (base.error || !base.data) return <Alert>{base.error}</Alert>;
  const { member: m, balance: b, loans, samity } = base.data;
  const open = loans.find((l) => l.status !== "closed") ?? null;
  const months = monthsBetween(m.joined_on);
  const inactive = b.bylaw_status === "inactive" || m.status === "inactive";

  return (
    <>
      <Link className="back" to="/members">
        ← Members
      </Link>
      <div className="phead">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="avatar" style={{ width: 56, height: 56, fontSize: 20, background: "#d7ebe1", color: "var(--ok)" }}>
            {initials(m.name)}
          </span>
          <div>
            <h1 className="ptitle">{m.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
              <b style={{ fontSize: 14 }}>{m.member_no}</b>
              <Chip kind={inactive ? "warn" : "ok"}>{inactive ? "Inactive" : "Active"}</Chip>
              <Chip kind={b.unpaid_deposits === 0 ? "ok" : b.unpaid_deposits >= 3 ? "bad" : "warn"}>{b.unpaid_deposits} unpaid deposits</Chip>
              {open && <Chip kind={open.status === "overdue" ? "bad" : "neu"}>Loan #{open.id} {open.status}</Chip>}
            </div>
          </div>
        </div>
        <div className="actions">
          {is("admin") && (
            <Link className="btn" to={`/members/${m.id}/edit`}>
              Edit
            </Link>
          )}
          {is("admin") &&
            (open ? (
              <button className="btn" type="button" disabled title="One open loan per member (Clause 4.1)">
                New loan
              </button>
            ) : (
              <Link className="btn" to={`/loans/new?member=${m.id}`}>
                New loan
              </Link>
            ))}
          <Link className="btn pri" to={`/collect?member=${m.id}`}>
            + Record transaction
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-k">Savings balance</div>
          <div className="kpi-v">{taka(b.savings_balance_paisa)}</div>
          <div className="kpi-s">
            {taka(b.total_deposits_paisa, { decimals: false })} in · {taka(b.total_withdrawals_paisa, { decimals: false })} out
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Can withdraw now</div>
          <div className="kpi-v">{taka(b.max_withdrawal_paisa)}</div>
          <div className="kpi-s">≤ 50%, once a year, keeps ⅓ of loan (Cl. 3.5)</div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Loan ceiling</div>
          <div className="kpi-v">{taka(b.loan_ceiling_paisa)}</div>
          <div className="kpi-s">3 × savings, max Tk 50,000 (Cl. 4.2)</div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Loan repayments</div>
          <div className="kpi-v">{taka(b.total_repayments_paisa)}</div>
          <div className="kpi-s">all loans, net of reversals</div>
        </div>
      </div>

      <div className="row mb">
        <section className="card pad col-3">
          {open ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
                <h2>
                  Loan #{open.id} · {taka(open.principal_paisa, { decimals: false })} · {open.term_months} months
                </h2>
                <Link to={`/loans/${open.id}`} style={{ fontSize: 14, fontWeight: 600 }}>
                  Schedule →
                </Link>
              </div>
              <Bar pct={(paidCount(open) / open.term_months) * 100} />
              <div className="mut" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8 }}>
                <span>
                  {paidCount(open)} of {open.term_months} paid
                </span>
                <span>started {dateLabel(open.start_on)}</span>
              </div>
              <div className="fgrid" style={{ marginTop: 18, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <div>
                  <div className="mut" style={{ fontSize: 13 }}>Principal left</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{taka(open.principal_outstanding_paisa)}</div>
                </div>
                <div>
                  <div className="mut" style={{ fontSize: 13 }}>Next instalment</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {taka(open.instalment_paisa, { decimals: false })} · {dateLabel(open.next_due_on, "en", false)}
                  </div>
                </div>
                <div>
                  <div className="mut" style={{ fontSize: 13 }}>Due now</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: open.due_now_paisa ? "var(--bad)" : "var(--ok)" }}>{taka(open.due_now_paisa)}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: 8 }}>No open loan</h2>
              <p className="mut" style={{ margin: 0, fontSize: 14 }}>
                {months < 6
                  ? `Member for ${months} months — loans open after 6 months (Clause 4.1).`
                  : b.unpaid_deposits > 0
                    ? "Unpaid deposits must be cleared before a loan (Clause 4.1)."
                    : `Eligible for up to ${taka(b.loan_ceiling_paisa, { decimals: false })}.`}
              </p>
            </>
          )}
        </section>
        <section className="card pad col-2">
          <h2 style={{ marginBottom: 14 }}>Profile</h2>
          <dl className="dl">
            <dt>Phone</dt>
            <dd>{m.phone}</dd>
            <dt>Joined</dt>
            <dd>
              {dateLabel(m.joined_on)} ({months} months)
            </dd>
            <dt>Samity</dt>
            <dd>{samity?.name ?? `#${m.samity_id}`}</dd>
            <dt>Login</dt>
            <dd>{m.user_id ? `User #${m.user_id}` : "Not linked"}</dd>
            <dt>Monthly deposit</dt>
            <dd>{taka(b.monthly_deposit_paisa, { decimals: false })} on the 10th</dd>
          </dl>
        </section>
      </div>

      <section className="card">
        <div className="tabs" role="tablist">
          <button className="tab" type="button" role="tab" aria-selected={tab === "tx"} onClick={() => setTab("tx")}>
            Transactions <span className="cnt">{txs.data?.total ?? "…"}</span>
          </button>
          <button className="tab" type="button" role="tab" aria-selected={tab === "loans"} onClick={() => setTab("loans")}>
            Loans <span className="cnt">{loans.length}</span>
          </button>
        </div>
        {tab === "tx" ? (
          txs.error ? (
            <div className="pad"><Alert>{txs.error}</Alert></div>
          ) : !txs.data ? (
            <Loading />
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="t resp">
                  <thead>
                    <tr><th>#</th><th>Date</th><th>Type</th><th className="num">Amount</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {txs.data.items.map((tx) => (
                      <tr key={tx.id} className={tx.reversed_by_id ? "struck" : tx.type === "reversal" ? "rev" : undefined}>
                        <td data-label="#" className="mut">{tx.id}</td>
                        <td data-label="Date">{dateLabel(tx.occurred_on)}</td>
                        <td data-label="Type"><TxChip type={tx.type} /></td>
                        <td data-label="Amount" className="num"><span className="amt">{(tx.type === "reversal" ? "− " : "") + taka(tx.amount_paisa)}</span></td>
                        <td className="mut nolabel" style={{ fontSize: 13 }}>
                          {tx.loan_id ? `Loan #${tx.loan_id}` : ""}
                          {tx.reverses_id ? `reverses #${tx.reverses_id}` : ""}
                          {tx.reversed_by_id ? `reversed by #${tx.reversed_by_id}` : ""}
                        </td>
                      </tr>
                    ))}
                    {txs.data.items.length === 0 && (
                      <tr><td colSpan={5} className="mut" style={{ textAlign: "center", padding: 24 }}>No transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={page} size={SIZE} total={txs.data.total} onPage={setPage} />
            </>
          )
        ) : (
          <div className="tbl-wrap">
            <table className="t resp">
              <thead>
                <tr><th>Loan</th><th className="num">Principal</th><th>Term</th><th>Started</th><th className="num">Outstanding</th><th>Status</th></tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td className="lead"><Link className="strong" to={`/loans/${l.id}`}>Loan #{l.id}</Link></td>
                    <td data-label="Principal" className="num">{taka(l.principal_paisa, { decimals: false })}</td>
                    <td data-label="Term">{l.term_months} months</td>
                    <td data-label="Started">{dateLabel(l.start_on)}</td>
                    <td data-label="Outstanding" className="num">{taka(l.outstanding_paisa)}</td>
                    <td data-label="Status"><Chip kind={l.status === "overdue" ? "bad" : l.status === "closed" ? "ok" : "neu"}>{l.status}</Chip></td>
                  </tr>
                ))}
                {loans.length === 0 && (
                  <tr><td colSpan={6} className="mut" style={{ textAlign: "center", padding: 24 }}>No loans.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

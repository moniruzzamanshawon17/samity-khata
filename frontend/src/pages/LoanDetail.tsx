import { Link, useParams } from "react-router-dom";
import { Alert, Bar, Chip, Loading, LoanChip } from "../components/ui";
import { api } from "../lib/api";
import { dateLabel, phone, taka } from "../lib/format";
import { paidCount, rowStates, type RowState } from "../lib/loan";
import type { Loan, LoanSchedule, Member } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const STATE_CHIP: Record<RowState, { kind: "ok" | "warn" | "bad" | "neu"; label: string } | null> = {
  paid: { kind: "ok", label: "Paid" },
  partial: { kind: "warn", label: "Part paid" },
  next: { kind: "warn", label: "Next" },
  overdue: { kind: "bad", label: "Overdue" },
  upcoming: null,
};

export function LoanDetail() {
  const { id } = useParams();
  const data = useAsync(async () => {
    const [loan, schedule] = await Promise.all([api.get<Loan>(`/loans/${id}`), api.get<LoanSchedule>(`/loans/${id}/schedule`)]);
    const member = await api.get<Member>(`/members/${loan.member_id}`);
    return { loan, schedule, member };
  }, [id]);

  if (data.loading) return <Loading />;
  if (data.error || !data.data) return <Alert>{data.error}</Alert>;
  const { loan: l, schedule, member: m } = data.data;
  const states = rowStates(schedule.rows, l);
  const paid = paidCount(l);
  const grace = l.next_due_on ? (() => {
    const [y, mo, d] = l.next_due_on.split("-").map(Number);
    return dateLabel(`${new Date(y, mo - 1, d + 15).toISOString().slice(0, 10)}`);
  })() : null;

  return (
    <>
      <Link className="back" to="/loans">← Loans</Link>
      <div className="phead">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="ptitle">Loan #{l.id}</h1>
            <LoanChip status={l.status} />
          </div>
          <p className="psub">
            <Link to={`/members/${m.id}`}>{m.name} · {m.member_no}</Link> · {taka(l.principal_paisa, { decimals: false })} · {l.term_months} months · {(l.annual_rate_bp / 100).toFixed(0)}% reducing · started {dateLabel(l.start_on)}
          </p>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => window.print()}>Print schedule</button>
          {l.status !== "closed" && (
            <Link className="btn pri" to={`/collect?member=${m.id}&type=repayment`}>Record repayment</Link>
          )}
        </div>
      </div>

      {l.status === "overdue" && (
        <div className="mb">
          <Alert>
            <b>Overdue.</b> {taka(l.due_now_paisa)} is due now. The status switches back to active once it is paid. Late fine Tk 20, +Tk 20 every 30 days, max Tk 100 (Cl. 5.2) — not posted to the ledger yet.
          </Alert>
        </div>
      )}

      <section className="card pad mb">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
          {[
            ["Instalment", taka(l.instalment_paisa, { decimals: false })],
            ["Repaid", taka(l.repaid_paisa)],
            ["Principal left", taka(l.principal_outstanding_paisa)],
            ["Interest charged so far", taka(l.interest_charged_paisa)],
            ["Due now", taka(l.due_now_paisa)],
            ["To close today", taka(l.outstanding_paisa)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="kpi-k" style={{ fontWeight: 400 }}>{k}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k === "Due now" ? (l.due_now_paisa ? "var(--bad)" : "var(--ok)") : undefined }} className="tnum">{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}><Bar pct={(paid / l.term_months) * 100} /></div>
        <div className="mut" style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", fontSize: 13, marginTop: 8 }}>
          <span>{paid} of {l.term_months} instalments paid</span>
          <span>
            {l.status === "closed" ? `closed ${dateLabel(l.closed_on)}` : l.next_due_on ? `next: ${dateLabel(l.next_due_on)} · overdue if unpaid after ${grace}` : ""}
          </span>
        </div>
      </section>

      <div className="row">
        <section className="card col-3" style={{ flexBasis: 560 }}>
          <div className="card-head">
            <h2>Repayment schedule</h2>
            <span className="mut" style={{ fontSize: 13 }}>Total interest {taka(schedule.total_interest_paisa)}</span>
          </div>
          <div className="tbl-wrap">
            <table className="t resp">
              <thead>
                <tr><th>Due</th><th className="num">Payment</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance after</th><th>Status</th></tr>
              </thead>
              <tbody>
                {schedule.rows.map((r, i) => {
                  const st = states[i];
                  const chip = STATE_CHIP[st];
                  return (
                    <tr key={r.month} className={st === "paid" ? "paid" : st === "next" || st === "partial" ? "next" : st === "overdue" ? "late" : undefined}>
                      <td className="lead">
                        <span>#{r.month} · {dateLabel(r.due_on)}</span>
                      </td>
                      <td data-label="Payment" className="num">{taka(r.payment_paisa)}</td>
                      <td data-label="Interest" className="num">{taka(r.interest_paisa)}</td>
                      <td data-label="Principal" className="num">{taka(r.principal_paisa)}</td>
                      <td data-label="Balance after" className="num">{taka(r.balance_after_paisa)}</td>
                      <td data-label="Status" className="st">{chip ? <Chip kind={chip.kind}>{chip.label}</Chip> : <span className="mut">Upcoming</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <div className="col-2 stack">
          <section className="card pad">
            <h2 style={{ marginBottom: 10 }}>How repayments apply</h2>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Interest is charged on each due date at 1% of the principal left.</li>
              <li>A payment clears unpaid interest first, then principal.</li>
              <li>Paying early lowers the principal, so later interest is smaller (Cl. 4.8).</li>
              <li>Reversing a repayment re-opens what it paid.</li>
            </ol>
          </section>
          <section className="card pad">
            <h2 style={{ marginBottom: 10 }}>Member</h2>
            <dl className="dl">
              <dt>Name</dt><dd><Link to={`/members/${m.id}`}>{m.name}</Link></dd>
              <dt>Member no.</dt><dd>{m.member_no}</dd>
              <dt>Phone</dt><dd>{phone(m.phone)}</dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

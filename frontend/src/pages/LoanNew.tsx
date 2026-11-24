import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MemberPicker } from "../components/MemberPicker";
import { Alert, Loading } from "../components/ui";
import { api, errorText } from "../lib/api";
import { getBalance, loadMembers, openLoanOf } from "../lib/data";
import { dateLabel, isoOf, monthsBetween, taka, takaToPaisa, todayIso } from "../lib/format";
import { previewSchedule, TERMS } from "../lib/loan";
import type { Loan, Member } from "../lib/types";
import { useAsync } from "../lib/useAsync";

function Check({ ok, warn, children }: { ok: boolean; warn?: boolean; children: ReactNode }) {
  const color = warn ? "var(--warn)" : ok ? "var(--ok)" : "var(--bad)";
  return (
    <div className="ck">
      <Icon name={ok && !warn ? "check" : "alert"} size={20} stroke={2.4} color={color} />
      <span>{children}</span>
    </div>
  );
}

/** Clause 4.8, same rule as the backend: the first 10th at least 15 days after disbursement. */
function firstDueDate(startIso: string): string {
  const [y, m, d] = startIso.split("-").map(Number);
  const earliest = new Date(y, m - 1, d + 15);
  const due = new Date(earliest.getFullYear(), earliest.getMonth(), 10);
  return isoOf(due >= earliest ? due : new Date(earliest.getFullYear(), earliest.getMonth() + 1, 10));
}

export function LoanNew() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const members = useAsync(loadMembers, []);
  const [member, setMember] = useState<Member | null>(null);
  const [amount, setAmount] = useState("20000");
  const [term, setTerm] = useState<number>(12);
  const [start, setStart] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = Number(params.get("member"));
    if (id && members.data && !member) setMember(members.data.find((m) => m.id === id) ?? null);
  }, [members.data, params, member]);

  const check = useAsync(async () => {
    if (!member) return null;
    const [balance, open] = await Promise.all([getBalance(member.id), openLoanOf(member.id)]);
    return { balance, open };
  }, [member?.id]);

  if (members.loading) return <Loading />;
  if (members.error) return <Alert>{members.error}</Alert>;

  const principal = takaToPaisa(amount) ?? 0;
  const months = member ? monthsBetween(member.joined_on) : 0;
  const c = check.data;
  const ceiling = c?.balance.loan_ceiling_paisa ?? 0;
  const over = !!c && principal > ceiling;
  const ok6 = months >= 6;
  const okDeposits = !!c && c.balance.unpaid_deposits === 0;
  const okOpen = !!c && !c.open;
  const okActive = !!c && c.balance.bylaw_status !== "inactive" && member?.status !== "inactive";
  const eligible = ok6 && okDeposits && okOpen && okActive && !over && principal > 0;
  const preview = previewSchedule(principal, term);
  const chips = [10000, 20000, 30000].map((t) => t * 100).concat(ceiling > 0 ? [ceiling] : []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      const loan = await api.post<Loan>("/loans", { member_id: member.id, principal_paisa: principal, term_months: term, start_on: start });
      nav(`/loans/${loan.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link className="back" to="/loans">← Loans</Link>
      <h1 className="ptitle" style={{ marginBottom: 4 }}>New loan</h1>
      <p className="psub" style={{ marginBottom: 20 }}>The bylaw checks run before you can issue. The server checks them again when you submit.</p>

      <div className="row">
        <form className="card col-3 stack" style={{ padding: 24, gap: 22 }} onSubmit={submit}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="lbl" htmlFor="member">Member</label>
            <MemberPicker members={members.data ?? []} value={member} onChange={setMember} />
          </div>
          <div>
            <label className="lbl" htmlFor="amt">Amount</label>
            <div className="money">
              <span>Tk</span>
              <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="pills" style={{ marginTop: 8 }}>
              {[...new Set(chips)].map((p) => (
                <button key={p} type="button" className="pill" aria-pressed={principal === p} onClick={() => setAmount(String(p / 100))}>
                  {p === ceiling ? `Max ${taka(p, { decimals: false })}` : taka(p, { decimals: false })}
                </button>
              ))}
            </div>
            {c && (
              <div className="hint">
                Ceiling for {member?.name.split(" ")[0]}: <b style={{ color: "var(--ink)" }}>{taka(ceiling, { decimals: false })}</b> = min(3 × savings {taka(c.balance.savings_balance_paisa, { decimals: false })}, Tk 50,000) · Clause 4.2
              </div>
            )}
          </div>
          <div>
            <span className="lbl">Term</span>
            <div className="pills">
              {TERMS.map((n) => (
                <button key={n} type="button" className="pill" aria-pressed={term === n} onClick={() => setTerm(n)}>
                  {n} months
                </button>
              ))}
            </div>
          </div>
          <div className="fgrid">
            <div>
              <label className="lbl" htmlFor="sd">Start date</label>
              <input className="inp" id="sd" type="date" max={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <span className="lbl">First instalment</span>
              <div style={{ height: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>{dateLabel(firstDueDate(start))}</div>
            </div>
          </div>
          {over && <Alert>Above the ceiling. {taka(principal, { decimals: false })} is more than the limit of {taka(ceiling, { decimals: false })} (Clause 4.2).</Alert>}
          <div className="form-foot">
            <Link className="btn" to="/loans">Cancel</Link>
            <button className="btn pri lg" type="submit" disabled={!member || !eligible || busy}>
              {busy ? "Issuing…" : `Issue loan${principal ? ` · ${taka(principal, { decimals: false })}` : ""}`}
            </button>
          </div>
        </form>

        <div className="col-2 stack">
          <section className="card pad">
            <h2 style={{ marginBottom: 6 }}>Eligibility · Clause 4.1</h2>
            {!member ? (
              <p className="mut" style={{ fontSize: 14 }}>Choose a member to run the checks.</p>
            ) : check.loading ? (
              <Loading />
            ) : check.error ? (
              <Alert>{check.error}</Alert>
            ) : (
              <>
                <Check ok={ok6}>Member for 6+ months <span className="mut">({months} months)</span></Check>
                <Check ok={okDeposits}>No unpaid monthly deposits {c && c.balance.unpaid_deposits > 0 && <span className="mut">({c.balance.unpaid_deposits} unpaid)</span>}</Check>
                <Check ok={okOpen}>No other open loan {c?.open && <Link to={`/loans/${c.open.id}`}>(loan #{c.open.id})</Link>}</Check>
                <Check ok={okActive}>Active member (Clause 2.4)</Check>
                <Check ok warn>Guarantor (4.1d) <span className="mut">— not tracked by the system yet; check on paper</span></Check>
              </>
            )}
          </section>
          <section className="card pad">
            <h2 style={{ marginBottom: 12 }}>Repayment preview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 }}>
              <div><div className="mut" style={{ fontSize: 13 }}>Monthly instalment</div><div style={{ fontSize: 24, fontWeight: 700 }}>{taka(preview.emi, { decimals: false })}</div></div>
              <div><div className="mut" style={{ fontSize: 13 }}>Total interest ≈</div><div style={{ fontSize: 24, fontWeight: 700 }}>{taka(preview.totalInterest, { decimals: false })}</div></div>
            </div>
            <table className="t">
              <thead><tr><th>Month</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 4).map((r) => (
                  <tr key={r.month}><td>{r.month}</td><td className="num">{taka(r.interest)}</td><td className="num">{taka(r.principal)}</td><td className="num">{taka(r.balance)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mut" style={{ fontSize: 12, marginTop: 8 }}>EMI rounded up to whole taka (Clause 4.7). 1% a month on the remaining principal. The final schedule comes from the server.</div>
          </section>
        </div>
      </div>
    </>
  );
}

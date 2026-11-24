import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MemberPicker } from "../components/MemberPicker";
import { Alert, Chip, Loading, PageHead } from "../components/ui";
import { api, errorText, fetchAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBalance, loadMembers } from "../lib/data";
import { dateLabel, taka, takaToPaisa, todayIso } from "../lib/format";
import type { Balance, Loan, Member, Transaction, TransactionInput } from "../lib/types";
import { useAsync } from "../lib/useAsync";

type Kind = TransactionInput["type"];

export function Collect() {
  const { user, is } = useAuth();
  const [params] = useSearchParams();
  const members = useAsync(loadMembers, []);
  const [member, setMember] = useState<Member | null>(null);
  const [type, setType] = useState<Kind>((params.get("type") as Kind) || "deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [loanId, setLoanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ tx: Transaction; name: string; no: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Preselect from ?member= (links from profile / loan pages).
  useEffect(() => {
    const id = Number(params.get("member"));
    if (id && members.data && !member) setMember(members.data.find((m) => m.id === id) ?? null);
  }, [members.data, params, member]);

  const snap = useAsync(async (): Promise<{ balance: Balance; loans: Loan[] } | null> => {
    if (!member) return null;
    const [balance, loans] = await Promise.all([getBalance(member.id), fetchAll<Loan>("/loans", { member_id: member.id })]);
    return { balance, loans: loans.filter((l) => l.status !== "closed") };
  }, [member?.id, refresh]);

  const today = useAsync(() => fetchAll<Transaction>("/transactions", { from: todayIso(), to: todayIso() }), [refresh]);

  const openLoans = snap.data?.loans ?? [];
  const loan = openLoans.find((l) => l.id === loanId) ?? openLoans[0] ?? null;
  const monthly = snap.data?.balance.monthly_deposit_paisa ?? 50000;

  // Sensible default amount when member / type changes.
  useEffect(() => {
    if (!snap.data) return;
    if (type === "deposit") setAmount(String(monthly / 100));
    else if (type === "repayment" && loan) setAmount(String((loan.due_now_paisa || loan.instalment_paisa) / 100));
    else setAmount("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.data, type, loan?.id]);

  const quick = useMemo(() => {
    if (type === "deposit") return [1, 2, 3].map((n) => ({ label: `${taka(monthly * n, { decimals: false })} (${n} month${n > 1 ? "s" : ""})`, paisa: monthly * n }));
    if (type === "repayment" && loan)
      return [
        { label: `${taka(loan.instalment_paisa, { decimals: false })} instalment`, paisa: loan.instalment_paisa },
        ...(loan.due_now_paisa > 0 ? [{ label: `${taka(loan.due_now_paisa, { decimals: false })} due now`, paisa: loan.due_now_paisa }] : []),
        { label: `Close loan ${taka(loan.outstanding_paisa)}`, paisa: loan.outstanding_paisa },
      ];
    if (type === "withdrawal" && snap.data) return [{ label: `Max ${taka(snap.data.balance.max_withdrawal_paisa)}`, paisa: snap.data.balance.max_withdrawal_paisa }];
    return [];
  }, [type, loan, monthly, snap.data]);

  const paisa = takaToPaisa(amount);
  const canSave = !!member && !!paisa && paisa > 0 && !busy && (type !== "repayment" || !!loan);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!member || !paisa) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const tx = await api.post<Transaction>("/transactions", {
        member_id: member.id,
        type,
        amount_paisa: paisa,
        occurred_on: date,
        loan_id: type === "repayment" ? loan?.id ?? null : null,
      } satisfies TransactionInput);
      setSaved({ tx, name: member.name, no: member.member_no });
      setRefresh((r) => r + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const mine = (today.data ?? []).filter((tx) => tx.recorded_by === user?.id && tx.type !== "reversal" && !tx.reversed_by_id);
  const mineTotal = mine.reduce((s, tx) => s + tx.amount_paisa, 0);
  const nameOf = (id: number) => members.data?.find((m) => m.id === id)?.name ?? `#${id}`;

  if (members.loading) return <Loading />;
  if (members.error) return <Alert>{members.error}</Alert>;

  return (
    <>
      <PageHead title="Record a transaction" bn="লেনদেন" sub="Entries are final. A mistake is fixed by the secretary with a reversal (Clause 3.4)." />

      {saved && (
        <div className="mb">
          <Alert kind="ok">
            <b>Saved #{saved.tx.id}</b> · {saved.tx.type} {taka(saved.tx.amount_paisa)} for {saved.name} ({saved.no})
          </Alert>
        </div>
      )}

      <div className="row">
        <form className="card col-3 stack" style={{ padding: 24, gap: 22 }} onSubmit={submit}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="lbl" htmlFor="member">Member</label>
            <MemberPicker members={members.data ?? []} value={member} onChange={(m) => { setMember(m); setSaved(null); setLoanId(null); }} />
          </div>
          <div>
            <span className="lbl">Type</span>
            <div className="typecards">
              <button type="button" className="typecard" aria-pressed={type === "deposit"} onClick={() => setType("deposit")}>
                <b>Deposit</b>Monthly savings
              </button>
              <button type="button" className="typecard" aria-pressed={type === "repayment"} onClick={() => setType("repayment")}>
                <b>Repayment</b>Loan instalment
              </button>
              <button
                type="button"
                className="typecard"
                aria-pressed={type === "withdrawal"}
                disabled={!is("admin")}
                title={is("admin") ? undefined : "Collectors cannot record withdrawals (Clause 6.2)"}
                onClick={() => setType("withdrawal")}
              >
                <b>Withdrawal</b>
                {is("admin") ? "From savings (Cl. 3.5)" : "Secretary only"}
              </button>
            </div>
          </div>
          {type === "repayment" && member && snap.data && (
            <div>
              <label className="lbl" htmlFor="ln">Loan</label>
              {openLoans.length ? (
                <select className="inp" id="ln" value={loan?.id ?? ""} onChange={(e) => setLoanId(Number(e.target.value))}>
                  {openLoans.map((l) => (
                    <option key={l.id} value={l.id}>
                      Loan #{l.id} · {taka(l.principal_paisa, { decimals: false })} · next due {dateLabel(l.next_due_on)} · {taka(l.instalment_paisa, { decimals: false })}
                    </option>
                  ))}
                </select>
              ) : (
                <Alert kind="warn">{member.name} has no open loan.</Alert>
              )}
              <div className="hint">Pays unpaid interest first, then principal. Paying more closes the loan sooner.</div>
            </div>
          )}
          <div className="fgrid">
            <div>
              <label className="lbl" htmlFor="amt">Amount</label>
              <div className="money">
                <span>Tk</span>
                <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </div>
              {amount && !paisa && <div className="emsg">Enter an amount in taka, e.g. 500 or 1777.50</div>}
              <div className="pills" style={{ marginTop: 8 }}>
                {quick.map((q) => (
                  <button key={q.label} type="button" className="quick" onClick={() => setAmount(String(q.paisa / 100))}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl" htmlFor="dt">Date</label>
              <input className="inp" id="dt" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
              <div className="hint">Today or earlier, never a future date.</div>
            </div>
          </div>
          <div className="form-foot">
            <button className="btn pri lg" type="submit" disabled={!canSave}>
              {busy ? "Saving…" : `Save ${type}${paisa ? ` · ${taka(paisa)}` : ""}`}
            </button>
          </div>
        </form>

        <div className="col-2 stack">
          {member && (
            <section className="card pad">
              <h2 style={{ marginBottom: 6 }}>{member.name.split(" ")[0]} at a glance</h2>
              {snap.loading && !snap.data ? (
                <Loading />
              ) : snap.data ? (
                <>
                  <div className="kv"><span className="mut">Savings</span><b className="tnum">{taka(snap.data.balance.savings_balance_paisa)}</b></div>
                  <div className="kv">
                    <span className="mut">Unpaid deposits</span>
                    <Chip kind={snap.data.balance.unpaid_deposits ? "warn" : "ok"}>{snap.data.balance.unpaid_deposits}</Chip>
                  </div>
                  <div className="kv"><span className="mut">Can withdraw</span><b className="tnum">{taka(snap.data.balance.max_withdrawal_paisa)}</b></div>
                  {loan ? (
                    <>
                      <div className="kv">
                        <span className="mut">Loan #{loan.id} due now</span>
                        <b className="tnum" style={{ color: loan.due_now_paisa ? "var(--bad)" : undefined }}>{taka(loan.due_now_paisa)}</b>
                      </div>
                      <div className="kv">
                        <span className="mut">Next instalment</span>
                        <b className="tnum">{taka(loan.instalment_paisa, { decimals: false })} · {dateLabel(loan.next_due_on, "en", false)}</b>
                      </div>
                    </>
                  ) : (
                    <div className="kv"><span className="mut">Loan</span><span className="mut">none open</span></div>
                  )}
                  <Link to={`/members/${member.id}`} style={{ fontSize: 14, fontWeight: 600 }}>Open profile →</Link>
                </>
              ) : (
                snap.error && <Alert>{snap.error}</Alert>
              )}
            </section>
          )}
          <section className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ marginBottom: 6 }}>My collections today</h2>
              <b className="tnum">{taka(mineTotal, { decimals: false })}</b>
            </div>
            {mine.length === 0 ? (
              <div className="mut" style={{ fontSize: 14, padding: "8px 0" }}>Nothing recorded by you today yet.</div>
            ) : (
              mine.map((tx) => (
                <div className="kv" key={tx.id}>
                  <span>{nameOf(tx.member_id)} · {tx.type}</span>
                  <span className="tnum">{taka(tx.amount_paisa, { decimals: false })}</span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </>
  );
}

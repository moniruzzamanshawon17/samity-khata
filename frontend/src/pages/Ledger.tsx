import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Loading, Modal, PageHead, Pager, TxChip } from "../components/ui";
import { api, errorText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBalance, loadMembers } from "../lib/data";
import { dateLabel, taka } from "../lib/format";
import type { Balance, Page, Transaction } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const SIZE = 20;

export function Ledger() {
  const { is, user } = useAuth();
  const [memberId, setMemberId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ tx: Transaction; balance: Balance | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const members = useAsync(loadMembers, []);
  const list = useAsync(
    () => api.get<Page<Transaction>>("/transactions", { member_id: memberId || undefined, from: from || undefined, to: to || undefined, page, size: SIZE }),
    [memberId, from, to, page],
  );
  const byId = new Map((members.data ?? []).map((m) => [m.id, m]));

  async function openReverse(tx: Transaction) {
    setNotice(null);
    setTarget({ tx, balance: null });
    try {
      setTarget({ tx, balance: await getBalance(tx.member_id) });
    } catch {
      /* the preview is optional */
    }
  }

  async function reverse() {
    if (!target) return;
    setBusy(true);
    try {
      const rev = await api.post<Transaction>(`/transactions/${target.tx.id}/reverse`);
      setNotice({ kind: "ok", text: `Reversal #${rev.id} added for #${target.tx.id}.` });
      list.reload();
    } catch (err) {
      setNotice({ kind: "bad", text: errorText(err) });
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  const items = list.data?.items ?? [];
  const inSum = items.filter((t) => (t.type === "deposit" || t.type === "repayment") && !t.reversed_by_id).reduce((s, t) => s + t.amount_paisa, 0);
  const outSum = items.filter((t) => t.type === "withdrawal" && !t.reversed_by_id).reduce((s, t) => s + t.amount_paisa, 0);

  const effect = (tx: Transaction) => (tx.type === "deposit" ? -tx.amount_paisa : tx.type === "withdrawal" ? tx.amount_paisa : 0);

  return (
    <>
      <PageHead
        title="Ledger"
        bn="খাতা"
        sub="Append-only. Rows are never edited or deleted; a correction adds a reversal that points to the original."
      >
        <Link className="btn pri" to="/collect">+ Record transaction</Link>
      </PageHead>

      <div className="card filters">
        <label className="flt">
          Member
          <select className="inp" value={memberId} onChange={(e) => { setMemberId(e.target.value); setPage(1); }} style={{ minWidth: 220 }}>
            <option value="">All members</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.member_no} {m.name}</option>
            ))}
          </select>
        </label>
        <label className="flt">From<input className="inp" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="flt">To<input className="inp" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        {(memberId || from || to) && (
          <button className="btn" type="button" onClick={() => { setMemberId(""); setFrom(""); setTo(""); setPage(1); }}>Clear</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div><div className="kpi-k" style={{ fontSize: 12 }}>IN (this page)</div><div style={{ fontWeight: 700, fontSize: 18 }}>{taka(inSum, { decimals: false })}</div></div>
          <div><div className="kpi-k" style={{ fontSize: 12 }}>OUT (this page)</div><div style={{ fontWeight: 700, fontSize: 18 }}>{taka(outSum, { decimals: false })}</div></div>
        </div>
      </div>

      {notice && <div className="mb"><Alert kind={notice.kind}>{notice.text}</Alert></div>}

      <section className="card">
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <div className="pad"><Alert>{list.error}</Alert></div>
        ) : (
          <>
            <div className="tbl-wrap" style={{ opacity: list.loading ? 0.6 : 1 }}>
              <table className="t resp">
                <thead>
                  <tr>
                    <th>#</th><th>Member</th><th>Date</th><th>Type</th><th>Loan</th><th className="num">Amount</th><th>Recorded by</th><th>Status</th>
                    {is("admin") && <th><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((tx) => {
                    const m = byId.get(tx.member_id);
                    const reversible = tx.type !== "reversal" && !tx.reversed_by_id;
                    return (
                      <tr key={tx.id} id={`tx${tx.id}`} className={tx.reversed_by_id ? "struck" : tx.type === "reversal" ? "rev" : undefined}>
                        <td data-label="#" className="mut">{tx.id}</td>
                        <td className="lead">
                          <span>
                            <Link className="strong" to={`/members/${tx.member_id}`}>{m?.name ?? `#${tx.member_id}`}</Link>{" "}
                            <span className="mut">{m?.member_no}</span>
                          </span>
                        </td>
                        <td data-label="Date">{dateLabel(tx.occurred_on)}</td>
                        <td data-label="Type" className="st"><TxChip type={tx.type} /></td>
                        <td data-label="Loan">{tx.loan_id ? <Link to={`/loans/${tx.loan_id}`}>#{tx.loan_id}</Link> : <span className="mut">—</span>}</td>
                        <td data-label="Amount" className="num"><span className="amt">{(tx.type === "reversal" ? "− " : "") + taka(tx.amount_paisa)}</span></td>
                        <td data-label="Recorded by" className="mut">{tx.recorded_by === user?.id ? "You" : `User #${tx.recorded_by}`}</td>
                        <td data-label="Status" style={{ fontSize: 13 }}>
                          {tx.reverses_id ? <>reverses <a href={`#tx${tx.reverses_id}`}>#{tx.reverses_id}</a></> : null}
                          {tx.reversed_by_id ? <>reversed by <a href={`#tx${tx.reversed_by_id}`}>#{tx.reversed_by_id}</a></> : null}
                          {!tx.reverses_id && !tx.reversed_by_id ? <span className="mut">—</span> : null}
                        </td>
                        {is("admin") && (
                          <td className="nolabel">{reversible && <button className="linkbtn bad rowact" type="button" onClick={() => openReverse(tx)}>Reverse</button>}</td>
                        )}
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={9} className="mut" style={{ textAlign: "center", padding: 24 }}>No transactions match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={SIZE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </section>

      {!is("admin") && (
        <div style={{ marginTop: 16 }}>
          <Alert kind="neu">Collectors see the ledger read-only: reversals are for the secretary only (Clauses 6.1–6.2).</Alert>
        </div>
      )}

      {target && (
        <Modal
          title={`Reverse transaction #${target.tx.id}?`}
          onClose={() => !busy && setTarget(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setTarget(null)} disabled={busy}>Cancel</button>
              <button className="btn danger" type="button" onClick={reverse} disabled={busy}>{busy ? "Adding…" : "Add reversal"}</button>
            </>
          }
        >
          <p>
            A new reversal row of <b style={{ color: "var(--ink)" }}>− {taka(target.tx.amount_paisa)}</b> is added for {byId.get(target.tx.member_id)?.name}. The original stays visible, crossed out. Each entry can be reversed once.
          </p>
          {target.balance && effect(target.tx) !== 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 14, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mut">Savings now</span><span>{taka(target.balance.savings_balance_paisa)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mut">After reversal</span><b>{taka(target.balance.savings_balance_paisa + effect(target.tx))}</b></div>
            </div>
          )}
          {target.tx.type === "repayment" && <p>The loan is recalculated: what this repayment paid becomes due again.</p>}
        </Modal>
      )}
    </>
  );
}

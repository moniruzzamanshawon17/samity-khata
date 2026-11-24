import { Link } from "react-router-dom";
import { Alert, Bar, Chip, Loading, PageHead, TxChip } from "../components/ui";
import { fetchAll, mapLimit } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBalance, loadMembers, loadSamities } from "../lib/data";
import { dateLabel, dateLocale, greeting, isoOf, taka, todayIso } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Balance, Loan, Member, Transaction } from "../lib/types";
import { useAsync } from "../lib/useAsync";

// There is no summary endpoint, so the dashboard adds up the list endpoints.
async function loadDashboard() {
  const now = new Date();
  const sixAgo = isoOf(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const [members, samities, active, overdue, txns] = await Promise.all([
    loadMembers(),
    loadSamities(),
    fetchAll<Loan>("/loans", { status: "active" }),
    fetchAll<Loan>("/loans", { status: "overdue" }),
    fetchAll<Transaction>("/transactions", { from: sixAgo, to: todayIso() }),
  ]);
  const balances = await mapLimit(members, 8, (m) => getBalance(m.id));
  return { members, samity: samities[0] ?? null, open: [...overdue, ...active], overdue, txns, balances };
}

export function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, error, loading } = useAsync(loadDashboard, []);

  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error}</Alert>;

  const { members, samity, open, overdue, txns, balances } = data;
  const byId = new Map<number, Member>(members.map((m) => [m.id, m]));
  const balById = new Map<number, Balance>(balances.map((b) => [b.member_id, b]));
  const inactive = balances.filter((b) => b.bylaw_status === "inactive");
  const savings = balances.reduce((s, b) => s + b.savings_balance_paisa, 0);
  const outstanding = open.reduce((s, l) => s + l.principal_outstanding_paisa, 0);
  const overdueAmt = overdue.reduce((s, l) => s + l.due_now_paisa, 0);

  const live = txns.filter((tx) => tx.type !== "reversal" && tx.reversed_by_id === null);
  const now = new Date();
  const monthKey = (iso: string) => iso.slice(0, 7);
  const thisMonth = isoOf(now).slice(0, 7);
  const monthTx = live.filter((tx) => monthKey(tx.occurred_on) === thisMonth);
  const depIn = monthTx.filter((tx) => tx.type === "deposit");
  const repIn = monthTx.filter((tx) => tx.type === "repayment");
  const depSum = depIn.reduce((s, tx) => s + tx.amount_paisa, 0);
  const repSum = repIn.reduce((s, tx) => s + tx.amount_paisa, 0);
  const activeMembers = members.filter((m) => m.status === "active");
  const depExpected = activeMembers.length * (samity?.monthly_deposit_paisa ?? 0);
  const repExpected = open.reduce((s, l) => s + l.instalment_paisa, 0);
  const paidMembers = new Set(depIn.map((tx) => tx.member_id)).size;
  const paidLoans = new Set(repIn.map((tx) => tx.loan_id)).size;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = isoOf(d).slice(0, 7);
    const sum = live.filter((tx) => tx.type !== "withdrawal" && monthKey(tx.occurred_on) === key).reduce((s, tx) => s + tx.amount_paisa, 0);
    return { key, label: d.toLocaleDateString(dateLocale(), { month: "short" }), sum, cur: key === thisMonth };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.sum));

  const unpaid = balances
    .filter((b) => b.unpaid_deposits > 0 && b.bylaw_status !== "inactive")
    .sort((a, b) => b.unpaid_deposits - a.unpaid_deposits);
  const recent = txns.slice(0, 6);
  const nextTenth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 10 ? 1 : 0), 10);
    return d.toLocaleDateString(dateLocale(), { day: "numeric", month: "long" });
  })();

  return (
    <>
      <PageHead
        title={`${greeting()}, ${user!.name.split(" ")[0]}`}
        sub={`${now.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${t("next deposit date")} ${nextTenth}`}
      >
        <Link className="btn" to="/assistant">
          Ask assistant
        </Link>
        <Link className="btn pri" to="/collect">
          + Record transaction
        </Link>
      </PageHead>

      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-k">Active members</div>
          <div className="kpi-v">
            {members.length - inactive.length} <span style={{ fontSize: 15, fontWeight: 500, color: "var(--muted)" }}>of {members.length}</span>
          </div>
          <div className="kpi-s" style={inactive.length ? { color: "var(--warn)" } : undefined}>
            {inactive.length ? `${inactive.length} inactive (3+ unpaid deposits, Cl. 2.4)` : "Everyone is active"}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Total savings</div>
          <div className="kpi-v">{taka(savings, { decimals: false })}</div>
          <div className="kpi-s">deposits − withdrawals</div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Loans outstanding</div>
          <div className="kpi-v">{taka(outstanding, { decimals: false })}</div>
          <div className="kpi-s">{open.length} open loans · principal left</div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Overdue loans</div>
          <div className="kpi-v" style={{ color: overdue.length ? "var(--bad)" : undefined }}>
            {overdue.length}
          </div>
          <div className="kpi-s" style={overdue.length ? { color: "var(--bad)" } : undefined}>
            {overdue.length ? `${taka(overdueAmt, { decimals: false })} due past the 15-day grace` : "No loan is overdue"}
          </div>
        </div>
      </div>

      <div className="row mb">
        <section className="card pad" style={{ flex: "2 1 480px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2>{now.toLocaleDateString(dateLocale(), { month: "long" })} {t("collection")}</h2>
            <Chip>due 10th</Chip>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginBottom: 16 }}>
            <div>
              <div className="mut" style={{ fontSize: 13 }}>Deposits collected</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {taka(depSum, { decimals: false })} <span className="mut" style={{ fontSize: 14, fontWeight: 500 }}>/ {taka(depExpected, { decimals: false })}</span>
              </div>
            </div>
            <div>
              <div className="mut" style={{ fontSize: 13 }}>Instalments collected</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {taka(repSum, { decimals: false })} <span className="mut" style={{ fontSize: 14, fontWeight: 500 }}>/ {taka(repExpected, { decimals: false })}</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Deposits · {paidMembers} of {activeMembers.length} members
          </div>
          <Bar pct={activeMembers.length ? (paidMembers / activeMembers.length) * 100 : 0} />
          <div style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 6px" }}>
            Instalments · {paidLoans} of {open.length} loans
          </div>
          <Bar pct={open.length ? (paidLoans / open.length) * 100 : 0} />
          <div className="cols" style={{ marginTop: 24 }} aria-label="Collected per month">
            {months.map((m) => (
              <div key={m.key} title={taka(m.sum, { decimals: false })}>
                <div className={`c${m.cur ? " cur" : ""}`} style={{ height: `${(m.sum / maxMonth) * 100}%` }} />
                <span className="mut" style={{ fontSize: 12, fontWeight: m.cur ? 600 : 400 }}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mut" style={{ fontSize: 12, marginTop: 8 }}>Collected per month (deposits + instalments, excluding reversed entries)</div>
        </section>

        <section className="card pad" style={{ flex: "1 1 320px" }}>
          <h2 style={{ marginBottom: 14 }}>Needs attention</h2>
          <div className="stack" style={{ gap: 12 }}>
            {overdue.map((l) => {
              const m = byId.get(l.member_id);
              return (
                <Link key={l.id} className="attn bad" to={`/loans/${l.id}`}>
                  <Chip kind="bad">{t("Overdue")}</Chip>
                  <span>
                    <b>{m?.name ?? `Member #${l.member_id}`}</b> {m?.member_no} · {taka(l.due_now_paisa, { decimals: false })} due now
                  </span>
                </Link>
              );
            })}
            {inactive.slice(0, 4).map((b) => {
              const m = byId.get(b.member_id);
              return (
                <Link key={`i${b.member_id}`} className="attn warn" to={`/members/${b.member_id}`}>
                  <Chip kind="warn">Inactive</Chip>
                  <span>
                    <b>{m?.name}</b> {m?.member_no} · {b.unpaid_deposits} deposits unpaid, loans refused
                  </span>
                </Link>
              );
            })}
            {unpaid.length > 0 && (
              <Link className="attn warn" to="/members">
                <Chip kind="warn">Due</Chip>
                <span>
                  {unpaid.length} member{unpaid.length > 1 ? "s have" : " has"} unpaid monthly deposits
                </span>
              </Link>
            )}
            {!overdue.length && !inactive.length && !unpaid.length && <div className="mut" style={{ fontSize: 14 }}>All clear — nothing overdue or unpaid.</div>}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{t("Recent transactions")}</h2>
          <Link to="/ledger" style={{ fontSize: 14, fontWeight: 600 }}>
            Open ledger →
          </Link>
        </div>
        <div className="tbl-wrap">
          <table className="t resp">
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Type</th>
                <th className="num">Amount</th>
                <th>Savings now</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((tx) => {
                const m = byId.get(tx.member_id);
                return (
                  <tr key={tx.id}>
                    <td data-label="Date">{dateLabel(tx.occurred_on)}</td>
                    <td className="lead">
                      <span>
                        <Link className="strong" to={`/members/${tx.member_id}`}>
                          {m?.name ?? `#${tx.member_id}`}
                        </Link>{" "}
                        <span className="mut">{m?.member_no}</span>
                      </span>
                    </td>
                    <td data-label="Type">
                      <TxChip type={tx.type} extra={tx.loan_id ? `Loan #${tx.loan_id}` : tx.reverses_id ? `of #${tx.reverses_id}` : undefined} />
                    </td>
                    <td data-label="Amount" className="num">{(tx.type === "reversal" ? "− " : "") + taka(tx.amount_paisa)}</td>
                    <td data-label="Savings now" className="mut">{taka(balById.get(tx.member_id)?.savings_balance_paisa ?? 0, { decimals: false })}</td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="mut" style={{ textAlign: "center", padding: 24 }}>
                    No transactions in the last six months.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

import { Link, useSearchParams } from "react-router-dom";
import { Alert, Bar, Loading, LoanChip, PageHead } from "../components/ui";
import { fetchAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { memberMap } from "../lib/data";
import { dateLabel, taka } from "../lib/format";
import { paidCount } from "../lib/loan";
import type { Loan, LoanStatus } from "../lib/types";
import { useAsync } from "../lib/useAsync";

type Filter = "all" | LoanStatus;
const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "overdue", label: "Overdue" },
  { key: "closed", label: "Closed" },
];

export function Loans() {
  const { is } = useAuth();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("status") as Filter) || "all";
  const data = useAsync(async () => {
    const [loans, members] = await Promise.all([fetchAll<Loan>("/loans"), memberMap()]);
    return { loans, members };
  }, []);

  if (data.loading) return <Loading />;
  if (data.error || !data.data) return <Alert>{data.error}</Alert>;
  const { loans, members } = data.data;
  const open = loans.filter((l) => l.status !== "closed");
  const rows = loans.filter((l) => filter === "all" || l.status === filter);
  const thisYear = String(new Date().getFullYear());

  return (
    <>
      <PageHead
        title="Loans"
        bn="ঋণ"
        sub="12% a year on the reducing balance (1% a month) · instalments due on the 10th · overdue 15 days after the due date"
      >
        {is("admin") && <Link className="btn pri" to="/loans/new">+ New loan</Link>}
      </PageHead>

      <div className="kpis">
        <div className="card kpi"><div className="kpi-k">Lent out (open)</div><div className="kpi-v">{taka(open.reduce((s, l) => s + l.principal_paisa, 0), { decimals: false })}</div></div>
        <div className="card kpi"><div className="kpi-k">Principal outstanding</div><div className="kpi-v">{taka(open.reduce((s, l) => s + l.principal_outstanding_paisa, 0), { decimals: false })}</div></div>
        <div className="card kpi">
          <div className="kpi-k">Interest charged</div>
          <div className="kpi-v">{taka(loans.reduce((s, l) => s + l.interest_charged_paisa, 0), { decimals: false })}</div>
          <div className="kpi-s">all loans to date ({thisYear})</div>
        </div>
        <div className="card kpi">
          <div className="kpi-k">Overdue amount</div>
          <div className="kpi-v" style={{ color: "var(--bad)" }}>{taka(loans.filter((l) => l.status === "overdue").reduce((s, l) => s + l.due_now_paisa, 0), { decimals: false })}</div>
        </div>
      </div>

      <section className="card">
        <div className="tabs" role="tablist">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              className="tab"
              type="button"
              role="tab"
              aria-selected={filter === tb.key}
              onClick={() => setParams(tb.key === "all" ? {} : { status: tb.key }, { replace: true })}
            >
              {tb.label} <span className="cnt">{tb.key === "all" ? loans.length : loans.filter((l) => l.status === tb.key).length}</span>
            </button>
          ))}
        </div>
        <div className="tbl-wrap">
          <table className="t resp">
            <thead>
              <tr><th>Loan</th><th>Member</th><th className="num">Principal</th><th>Term</th><th className="num">Instalment</th><th>Progress</th><th className="num">Outstanding</th><th>Next due</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const m = members.get(l.member_id);
                const paid = paidCount(l);
                return (
                  <tr key={l.id} className={l.status === "overdue" ? "late" : undefined}>
                    <td data-label="Loan"><Link className="strong" to={`/loans/${l.id}`}>#{l.id}</Link></td>
                    <td className="lead"><span><Link className="strong" to={`/loans/${l.id}`}>{m?.name ?? `#${l.member_id}`}</Link> <span className="mut">{m?.member_no}</span></span></td>
                    <td data-label="Principal" className="num">{taka(l.principal_paisa, { decimals: false })}</td>
                    <td data-label="Term">{l.term_months} mo</td>
                    <td data-label="Instalment" className="num">{taka(l.instalment_paisa, { decimals: false })}</td>
                    <td data-label="Progress">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Bar small pct={(paid / l.term_months) * 100} />
                        <span className="mut" style={{ fontSize: 12 }}>{paid}/{l.term_months}</span>
                      </div>
                    </td>
                    <td data-label="Outstanding" className="num">{taka(l.outstanding_paisa, { decimals: false })}</td>
                    <td data-label="Next due">{l.status === "closed" ? <span className="mut">closed {dateLabel(l.closed_on)}</span> : dateLabel(l.next_due_on)}</td>
                    <td data-label="Status" className="st"><LoanChip status={l.status} /></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="mut" style={{ textAlign: "center", padding: 24 }}>No {filter === "all" ? "" : filter} loans.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

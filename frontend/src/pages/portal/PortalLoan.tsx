import { Alert, Loading } from "../../components/ui";
import { useMyAccount } from "../../components/PortalShell";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { dateLabel, num, taka } from "../../lib/format";
import { paidCount, rowStates } from "../../lib/loan";
import type { LoanSchedule } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { NotLinked, PortalHeader } from "./PortalHome";

export function PortalLoan() {
  const { t, locale } = useI18n();
  const acct = useMyAccount();
  const loan = acct.data?.loan ?? null;
  const sched = useAsync(async () => (loan ? api.get<LoanSchedule>(`/loans/${loan.id}/schedule`) : null), [loan?.id]);

  const sub = loan ? `#${loan.id} · ${num(loan.term_months, locale)} ${locale.startsWith("bn") ? "মাস · ১২% (ক্রমহ্রাসমান)" : "months · 12% reducing"}` : undefined;

  return (
    <>
      <PortalHeader title={t("My loan")} sub={sub} flat />
      <div className="p-body">
        {acct.loading ? (
          <Loading />
        ) : acct.error ? (
          <Alert>{acct.error}</Alert>
        ) : !acct.data?.member ? (
          <NotLinked />
        ) : !loan ? (
          <div className="p-card" style={{ textAlign: "center", padding: 24 }}>
            <b style={{ display: "block", marginBottom: 6 }}>{t("No loan yet")}</b>
            <span className="mut" style={{ fontSize: 14 }}>
              {t("Loan ceiling")}: {taka(acct.data.balance?.loan_ceiling_paisa ?? 0, { locale, decimals: false })}
            </span>
          </div>
        ) : (
          <div className="p-cols">
            <div className="p-col">
            <div className="p-loanhero">
              <div className="sub">{t("Principal left")}</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 2 }}>{taka(loan.principal_outstanding_paisa, { locale })}</div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.22)", overflow: "hidden", marginTop: 12 }}>
                <div style={{ width: `${(paidCount(loan) / loan.term_months) * 100}%`, height: "100%", background: "#fff" }} />
              </div>
              <div className="sub" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                <span>{num(paidCount(loan), locale)}/{num(loan.term_months, locale)} {t("instalments paid")}</span>
                <span>{t(loan.status[0].toUpperCase() + loan.status.slice(1))}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.2)" }}>
                <div><div className="sub" style={{ fontSize: 12 }}>{t("Due now")}</div><div style={{ fontWeight: 700 }}>{taka(loan.due_now_paisa, { locale })}</div></div>
                <div><div className="sub" style={{ fontSize: 12 }}>{t("Total repaid")}</div><div style={{ fontWeight: 700 }}>{taka(loan.repaid_paisa, { locale, decimals: false })}</div></div>
              </div>
            </div>
            <div className="p-card bn" style={{ background: "#fef8ef", border: 0, fontSize: 13, lineHeight: 1.55, color: "#5c3600" }}>
              {locale.startsWith("bn")
                ? "কিস্তি ১০ তারিখের ১৫ দিন পরেও না দিলে ঋণ “বকেয়া” হবে এবং ২০ টাকা জরিমানা (ধারা ৫.১–৫.২)। আগে দিলে সুদ কমে যায় (ধারা ৪.৮)।"
                : "An instalment unpaid 15 days after the 10th makes the loan overdue, with a Tk 20 fine (Clauses 5.1–5.2). Paying early lowers the interest (Clause 4.8)."}
            </div>
            </div>
            <div className="p-card" style={{ padding: "6px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px" }}>
                <b>{t("Repayment schedule")}</b>
                {sched.data && <span className="mut" style={{ fontSize: 12 }}>{t("Total interest")} {taka(sched.data.total_interest_paisa, { locale })}</span>}
              </div>
              {sched.loading ? (
                <Loading />
              ) : sched.data ? (
                sched.data.rows.map((r, i) => {
                  const st = rowStates(sched.data!.rows, loan)[i];
                  const hl = st === "next" || st === "partial";
                  return (
                    <div
                      key={r.month}
                      style={{
                        display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "center", padding: "11px 0",
                        borderBottom: "1px solid var(--line-2)", fontSize: 14,
                        ...(hl ? { background: "var(--primary-soft)", margin: "0 -16px", padding: "11px 16px", fontWeight: 600 } : {}),
                        ...(st === "overdue" ? { color: "var(--bad)" } : {}),
                      }}
                    >
                      <span className="mut" style={{ fontSize: 12, fontWeight: 600 }}>{num(r.month, locale)}</span>
                      <span>
                        {dateLabel(r.due_on, locale)}{" "}
                        {st === "paid" && <span className="chip ok" style={{ height: 20, fontSize: 11 }}>{t("Paid")}</span>}
                        {hl && <span className="chip warn" style={{ height: 20, fontSize: 11 }}>{t("Next")}</span>}
                        {st === "overdue" && <span className="chip bad" style={{ height: 20, fontSize: 11 }}>{t("Overdue")}</span>}
                      </span>
                      <span style={{ fontWeight: 600 }}>{taka(r.payment_paisa, { locale, decimals: false })}</span>
                    </div>
                  );
                })
              ) : (
                sched.error && <Alert>{sched.error}</Alert>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

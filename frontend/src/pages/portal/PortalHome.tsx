import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Alert, Bar, Loading } from "../../components/ui";
import { useMyAccount } from "../../components/PortalShell";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { dateLabel, daysUntil, num, taka } from "../../lib/format";
import { paidCount } from "../../lib/loan";
import { PortalTx } from "./PortalHistory";

export function PortalHeader({ title, sub, flat, action }: { title: string; sub?: string; flat?: boolean; action?: ReactNode }) {
  const { lang, setLang, t } = useI18n();
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className={`p-head${flat ? " flat" : ""}`}>
      <div className="p-head-top">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: "#a9c2b6", marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
        {/* Page action (e.g. New chat): visible on every screen size */}
        {action}
        <div className="p-head-actions">
          <button type="button" className="p-chipbtn" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
            {lang === "bn" ? "EN" : "বাং"}
          </button>
          <button
            type="button"
            className="p-chipbtn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            <Icon name="logout" size={14} />
            {t("Sign out")}
          </button>
        </div>
        </div>
      </div>
    </header>
  );
}

export function NotLinked() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="p-card" style={{ textAlign: "center", padding: 24 }}>
      <b style={{ display: "block", marginBottom: 6 }}>{t("Your account is not linked yet")}</b>
      <p className="mut" style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55 }}>
        {t("Ask the secretary to link your login to your member number. Until then you can still ask the assistant about the bylaws.")}
      </p>
      {user && (
        <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", margin: "0 0 16px", fontSize: 14, lineHeight: 1.6 }}>
          <div className="mut" style={{ fontSize: 12 }}>{t("Tell the secretary")}</div>
          <div>
            {t("Account ID")}: <b style={{ fontSize: 18 }}>{user.id}</b>
          </div>
          <div className="mut" style={{ overflowWrap: "anywhere" }}>{user.email}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn pri" to="/me/ask">{t("Ask")}</Link>
        <button
          type="button"
          className="btn"
          onClick={() => {
            logout();
            nav("/login");
          }}
        >
          <Icon name="logout" size={16} />
          {t("Sign out")}
        </button>
      </div>
    </div>
  );
}

export function PortalHome() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { data, loading, error } = useMyAccount();

  const member = data?.member;
  return (
    <>
      <PortalHeader
        title={member?.name ?? user?.name ?? ""}
        sub={member ? `${t("Member no.")} ${member.member_no}` : t("Good day")}
        flat={!member}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="p-body"><Alert>{error}</Alert></div>
      ) : !data || !member || !data.balance ? (
        <div className="p-body"><NotLinked /></div>
      ) : (
        <>
          <div className="p-hero">
            <div>
              <div className="mut" style={{ fontSize: 13, fontWeight: 600 }}>{t("My savings")}</div>
              <div className="p-big">{taka(data.balance.savings_balance_paisa, { locale })}</div>
              <div className="chips" style={{ marginTop: 8 }}>
                <span className={`chip ${data.balance.bylaw_status === "inactive" ? "warn" : "ok"}`}>
                  {t(data.balance.bylaw_status === "inactive" ? "Inactive member" : "Active member")}
                </span>
                <span className={`chip ${data.balance.unpaid_deposits ? "warn" : "ok"}`}>
                  {data.balance.unpaid_deposits ? `${num(data.balance.unpaid_deposits, locale)} ${t("unpaid deposits")}` : t("No unpaid deposits")}
                </span>
              </div>
            </div>
            <div className="p-split">
              <div><div className="mut" style={{ fontSize: 12 }}>{t("Can withdraw")}</div><div style={{ fontWeight: 700 }}>{taka(data.balance.max_withdrawal_paisa, { locale, decimals: false })}</div></div>
              <div><div className="mut" style={{ fontSize: 12 }}>{t("Loan ceiling")}</div><div style={{ fontWeight: 700 }}>{taka(data.balance.loan_ceiling_paisa, { locale, decimals: false })}</div></div>
            </div>
          </div>
          <div className="p-body">
            <div className="p-cols">
            <div className="p-col">
            {data.loan && data.loan.status !== "closed" && (
              <Link to="/me/loan" className="p-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <b>{t("Next instalment")}</b>
                  {data.loan.status === "overdue" ? (
                    <span className="chip bad">{t("Overdue")}</span>
                  ) : data.loan.next_due_on ? (
                    <span className="chip warn">{num(Math.max(0, daysUntil(data.loan.next_due_on)), locale)} {locale.startsWith("bn") ? "দিন বাকি" : "days left"}</span>
                  ) : null}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 20 }}>{taka(data.loan.due_now_paisa || data.loan.instalment_paisa, { locale, decimals: false })}</span>
                  <span className="mut" style={{ fontSize: 13 }}>{dateLabel(data.loan.next_due_on, locale, false)} · #{data.loan.id}</span>
                </div>
                <div style={{ marginTop: 10 }}><Bar small pct={(paidCount(data.loan) / data.loan.term_months) * 100} /></div>
                <div className="mut" style={{ fontSize: 12, marginTop: 6 }}>
                  {num(paidCount(data.loan), locale)}/{num(data.loan.term_months, locale)} {t("instalments paid")}
                </div>
              </Link>
            )}
            <Link to="/me/ask" className="p-card" style={{ display: "flex", alignItems: "center", gap: 12, background: "#e9f1ec", border: 0, textDecoration: "none", color: "inherit" }}>
              <Icon name="chat" size={22} color="var(--primary)" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t("Questions about the rules? Ask the assistant")}</span>
            </Link>
            </div>
            <div className="p-col">
            <div className="p-card" style={{ padding: "4px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 2px" }}>
                <b>{t("Recent transactions")}</b>
                <Link to="/me/history" style={{ fontSize: 13, fontWeight: 600 }}>{t("History")} →</Link>
              </div>
              {data.transactions.slice(0, 5).map((tx) => <PortalTx key={tx.id} tx={tx} />)}
            </div>
            </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

import { createContext, useContext } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import markWhiteUrl from "../assets/brand/samity-khata-mark-white.svg";
import { InfoPill, LangToggle, PageTitle, pageMeta, UserMenu } from "./NavParts";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { dateLabel, daysUntil, phone, taka } from "../lib/format";
import { useAsync, type AsyncState } from "../lib/useAsync";
import { loadMyAccount, type MyAccount } from "../lib/data";

const AccountCtx = createContext<AsyncState<MyAccount> | null>(null);
export function useMyAccount() {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useMyAccount outside PortalShell");
  return c;
}

const TABS = [
  { to: "/me", label: "Home", icon: "home" },
  { to: "/me/loan", label: "My loan", icon: "loan" },
  { to: "/me/history", label: "History", icon: "list" },
  { to: "/me/ask", label: "Ask", icon: "chat" },
];

export function PortalShell() {
  const { t, locale } = useI18n();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const account = useAsync(loadMyAccount, []);
  const member = account.data?.member;
  const loan = account.data?.loan;
  const openLoan = loan && loan.status !== "closed" ? loan : null;

  return (
    <AccountCtx.Provider value={account}>
      <div className="portal">
        {/* PC: sidebar */}
        <aside className="side p-side">
          <NavLink to="/me" className="brand" aria-label="Samity Khata home">
            <img src={markWhiteUrl} alt="" width={36} className="brand-img" />
            <span className="brand-text">
              <span className="brand-name" style={{ display: "block" }}>Samity Khata</span>
              <span className="brand-sub bn" style={{ display: "block" }}>{t("Member app")}</span>
            </span>
          </NavLink>
          <div className="side-label">Menu</div>
          <nav className="navs" aria-label="Member">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end
                className={({ isActive }) => `nav${isActive ? " active" : ""}`}
                aria-label={t(tab.label)}
                title={t(tab.label)}
              >
                <Icon name={tab.icon} />
                <span className="nav-label">{t(tab.label)}</span>
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            {member && (
              <div className="samity-card">
                <div className="side-label" style={{ padding: 0, marginBottom: 6 }}>{t("Member no.")}</div>
                <div className="samity-name">{member.member_no}</div>
                <div className="samity-meta">
                  <span>Member since {dateLabel(member.joined_on, locale)}</span>
                  <span>{phone(member.phone)}</span>
                </div>
              </div>
            )}
            <NavLink to="/pricing" className="side-quiet">Pricing</NavLink>
          </div>
        </aside>

        <div className="phone">
          {/* PC: top navbar */}
          <header className="topnav">
            <PageTitle meta={pageMeta(loc.pathname)} />
            <div className="tn-right">
              {account.data?.balance && (
                <InfoPill icon="users" label={t("My savings")} value={taka(account.data.balance.savings_balance_paisa, { locale, decimals: false })} />
              )}
              {openLoan?.next_due_on && (
                <InfoPill
                  icon="calendar"
                  label={t("Next instalment")}
                  value={`${taka(openLoan.due_now_paisa || openLoan.instalment_paisa, { locale, decimals: false })} · ${dateLabel(openLoan.next_due_on, locale, false)}`}
                  tone={openLoan.status === "overdue" ? "bad" : daysUntil(openLoan.next_due_on) <= 3 ? "warn" : undefined}
                />
              )}
              <LangToggle />
              <span className="tn-sep" aria-hidden="true" />
              <UserMenu
                name={member?.name ?? user?.name ?? ""}
                sub={member ? `${t("Member")} · ${member.member_no}` : t("Member")}
                email={user?.email}
                items={[
                  { label: "History", icon: "list", to: "/me/history" },
                  { label: "Pricing", icon: "loan", to: "/pricing" },
                  { label: "Ask", icon: "chat", to: "/me/ask" },
                  {
                    label: "Sign out",
                    icon: "logout",
                    danger: true,
                    onClick: () => {
                      logout();
                      nav("/login");
                    },
                  },
                ]}
              />
            </div>
          </header>

          <Outlet />

          {/* Mobile: bottom tabs */}
          <nav className="tabbar" aria-label="App">
            {TABS.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => `tabi${isActive ? " active" : ""}`}>
                <Icon name={tab.icon} size={22} />
                {t(tab.label)}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </AccountCtx.Provider>
  );
}

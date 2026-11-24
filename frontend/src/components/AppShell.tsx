import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { InfoPill, LangToggle, nextTenth, OverdueBell, PageTitle, pageMeta, QuickSearch, UserMenu, type MenuItem } from "./NavParts";
import { ROLE_LABEL, useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { daysUntil, initials, isoOf, taka } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { loadSamities } from "../lib/data";
import type { Role } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: string;
  roles: Role[];
  tab?: boolean; // shown in the mobile bottom bar
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", short: "Home", icon: "dashboard", roles: ["admin", "staff"], tab: true },
  { to: "/members", label: "Members", icon: "users", roles: ["admin", "staff"], tab: true },
  { to: "/collect", label: "Collect", icon: "plus", roles: ["admin", "staff"], tab: true },
  { to: "/loans", label: "Loans", icon: "loan", roles: ["admin", "staff"], tab: true },
  { to: "/ledger", label: "Ledger", icon: "list", roles: ["admin", "staff"] },
  { to: "/bylaws", label: "Bylaws", icon: "book", roles: ["admin", "staff"] },
  { to: "/assistant", label: "Assistant", icon: "chat", roles: ["admin", "staff"] },
  { to: "/settings", label: "Settings", icon: "settings", roles: ["admin"] },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const samities = useAsync(loadSamities, []);
  const [sheet, setSheet] = useState(false);

  useEffect(() => setSheet(false), [loc.pathname]);
  if (!user) return null;

  const samity = samities.data?.[0] ?? null;
  const samityName = samity?.name ?? "Samity Khata";
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const tabs = items.filter((n) => n.tab);
  const more = items.filter((n) => !n.tab);
  const moreActive = more.some((n) => loc.pathname.startsWith(n.to));
  const meta = pageMeta(loc.pathname);
  const due = nextTenth();
  const dueIn = daysUntil(isoOf(due));
  const signOut = () => {
    logout();
    nav("/login");
  };
  const menu: MenuItem[] = [
    ...(user.role === "admin" ? [{ label: "Settings", icon: "settings", to: "/settings" }] : []),
    { label: "Assistant", icon: "chat", to: "/assistant" },
    { label: "Sign out", icon: "logout", onClick: signOut, danger: true },
  ];

  return (
    <div className="shell">
      {/* ---- PC: sidebar ---- */}
      <aside className="side">
        <NavLink to="/" className="brand" aria-label="Samity Khata home">
          <span className="brand-mark">
            <Icon name="logo" />
          </span>
          <span>
            <span className="brand-name" style={{ display: "block" }}>Samity Khata</span>
            <span className="brand-sub bn" style={{ display: "block" }}>সমিতি খাতা</span>
          </span>
        </NavLink>
        <div className="side-label">Menu</div>
        <nav className="navs" aria-label="Main">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `nav${isActive ? " active" : ""}`}>
              <Icon name={n.icon} />
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="samity-card">
            <div className="side-label" style={{ padding: 0, marginBottom: 6 }}>Samity</div>
            <div className="samity-name" title={samityName}>{samityName}</div>
            {samity && (
              <div className="samity-meta">
                <span>{samity.union} union</span>
                <span>Deposit {taka(samity.monthly_deposit_paisa, { decimals: false })} · due 10th</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="content">
        {/* ---- PC: top navbar ---- */}
        <header className="topnav">
          <PageTitle meta={meta} />
          <QuickSearch />
          <div className="tn-right">
            <InfoPill
              icon="calendar"
              label="Next due date"
              value={`${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${dueIn === 0 ? "today" : `${dueIn}d`}`}
              tone={dueIn <= 3 ? "warn" : undefined}
            />
            <OverdueBell />
            <LangToggle />
            <span className="tn-sep" aria-hidden="true" />
            <UserMenu name={user.name} sub={ROLE_LABEL[user.role]} email={user.email} items={menu} />
          </div>
        </header>

        {/* ---- Mobile: top bar ---- */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <NavLink to="/" className="brand-mark" style={{ width: 32, height: 32 }} aria-label="Samity Khata home">
              <Icon name="logo" size={16} />
            </NavLink>
            <div style={{ minWidth: 0 }}>
              <div className="topbar-title">{t(meta.title)}</div>
              <div className="topbar-sub">{samityName}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <OverdueBell compact />
            <button type="button" className="topbar-user" onClick={() => setSheet(true)} aria-label="Account and more">
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(user.name)}</span>
            </button>
          </div>
        </header>

        <main className="main">
          <div className="main-narrow">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ---- Mobile: bottom tabs ---- */}
      <nav className="bottombar" aria-label="Main">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `tabi${isActive ? " active" : ""}`}>
            <Icon name={n.icon} size={22} />
            {t(n.short ?? n.label)}
          </NavLink>
        ))}
        <button type="button" className={`tabi${moreActive || sheet ? " active" : ""}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
          <Icon name="more" size={22} />
          {t("More")}
        </button>
      </nav>

      {sheet && (
        <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More">
            <div className="sheet-grab" aria-hidden="true" />
            <div className="usercard" style={{ background: "var(--surface-2)", marginBottom: 6 }}>
              <span className="avatar">{initials(user.name)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{user.name}</span>
                <span className="mut" style={{ display: "block", fontSize: 12 }}>{ROLE_LABEL[user.role]} · {user.email}</span>
              </span>
            </div>
            {more.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `item${isActive ? " active" : ""}`}>
                <Icon name={n.icon} size={20} />
                {t(n.label)}
              </NavLink>
            ))}
            <div style={{ display: "flex", gap: 8, padding: "8px 4px 4px" }}>
              <div className="seg" role="group" aria-label="Language" style={{ flex: 1 }}>
                <button type="button" style={{ flex: 1 }} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
                <button type="button" className="bn" style={{ flex: 1 }} aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাংলা</button>
              </div>
              <button type="button" className="btn danger-o" style={{ minHeight: 44 }} onClick={signOut}>
                <Icon name="logout" size={16} />
                {t("Sign out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

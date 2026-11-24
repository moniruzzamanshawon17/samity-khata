import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { Drawer } from "./Drawer";
import markWhiteUrl from "../assets/brand/samity-khata-mark-white.svg";
import { LangToggle, OverdueBell, PageTitle, pageMeta, QuickSearch, UserMenu, type MenuItem } from "./NavParts";
import { ROLE_LABEL, useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { taka } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { loadSamities } from "../lib/data";
import { PHONE, useMedia } from "../lib/useMedia";
import type { Role } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", roles: ["admin", "staff"] },
  { to: "/members", label: "Members", icon: "users", roles: ["admin", "staff"] },
  { to: "/collect", label: "Collect", icon: "plus", roles: ["admin", "staff"] },
  { to: "/loans", label: "Loans", icon: "loan", roles: ["admin", "staff"] },
  { to: "/ledger", label: "Ledger", icon: "list", roles: ["admin", "staff"] },
  { to: "/bylaws", label: "Bylaws", icon: "book", roles: ["admin", "staff"] },
  { to: "/assistant", label: "Assistant", icon: "chat", roles: ["admin", "staff"] },
  { to: "/settings", label: "Settings", icon: "settings", roles: ["admin"] },
];

/*
 * Layout by width:
 *   1024px+    full sidebar + top navbar
 *   768–1023   icon-only rail (72px) + top navbar
 *   <768       dark top bar with a menu button that opens the sidebar as a drawer
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const samities = useAsync(loadSamities, []);
  const [drawer, setDrawer] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  // Render only the header for the current size, so search/bell/menu aren't mounted twice.
  const isPhone = useMedia(PHONE);

  // Choosing a page closes the drawer and the phone search.
  useEffect(() => {
    setDrawer(false);
    setPhoneSearch(false);
  }, [loc.pathname]);

  // Rotating/resizing past the phone breakpoint closes phone-only UI.
  useEffect(() => {
    if (!isPhone) {
      setDrawer(false);
      setPhoneSearch(false);
    }
  }, [isPhone]);

  if (!user) return null;

  const samity = samities.data?.[0] ?? null;
  const samityName = samity?.name ?? "Samity Khata";
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const meta = pageMeta(loc.pathname);
  const signOut = () => {
    logout();
    nav("/login");
  };
  const menu: MenuItem[] = [
    ...(user.role === "admin" ? [{ label: "Settings", icon: "settings", to: "/settings" }] : []),
    { label: "Assistant", icon: "chat", to: "/assistant" },
    { label: "Pricing", icon: "loan", to: "/pricing" },
    { label: "Sign out", icon: "logout", onClick: signOut, danger: true },
  ];

  const brand = (
    <NavLink to="/" className="brand" aria-label="Samity Khata home">
      <img src={markWhiteUrl} alt="" width={36} className="brand-img" />
      <span className="brand-text">
        <span className="brand-name" style={{ display: "block" }}>Samity Khata</span>
        <span className="brand-sub bn" style={{ display: "block" }}>সমিতি খাতা</span>
      </span>
    </NavLink>
  );

  const navList = (
    <nav className="navs" aria-label="Main">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          className={({ isActive }) => `nav${isActive ? " active" : ""}`}
          aria-label={t(n.label)}
          title={t(n.label)}
        >
          <Icon name={n.icon} />
          <span className="nav-label">{t(n.label)}</span>
        </NavLink>
      ))}
    </nav>
  );

  const foot = (
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
      <NavLink to="/pricing" className="side-quiet">Pricing</NavLink>
    </div>
  );

  return (
    <div className="shell">
      {/* ---- Desktop sidebar / tablet rail ---- */}
      <aside className="side side-main">
        {brand}
        <div className="side-label">Menu</div>
        {navList}
        {foot}
      </aside>

      <div className="content">
        {/* ---- Desktop + tablet: top navbar ---- */}
        {!isPhone && (
        <header className="topnav">
          <PageTitle meta={meta} />
          <QuickSearch />
          <div className="tn-right">
            <OverdueBell />
            <LangToggle />
            <span className="tn-sep" aria-hidden="true" />
            <UserMenu name={user.name} sub={ROLE_LABEL[user.role]} email={user.email} items={menu} />
          </div>
        </header>
        )}

        {/* ---- Phone: top bar (menu · title · search · bell · avatar) ---- */}
        {isPhone && (
        <header className="topbar">
          {phoneSearch ? (
            <>
              <button type="button" className="tn-icon dark" aria-label="Close search" onClick={() => setPhoneSearch(false)}>
                <Icon name="back" size={22} />
              </button>
              <div className="topbar-search">
                <QuickSearch autoFocus />
              </div>
            </>
          ) : (
            <>
              <button
                ref={menuBtn}
                type="button"
                className="tn-icon dark"
                aria-label="Open menu"
                aria-expanded={drawer}
                onClick={() => setDrawer(true)}
              >
                <Icon name="menu" size={22} />
              </button>
              <div className="topbar-title">{t(meta.title)}</div>
              <div className="topbar-actions">
                <button type="button" className="tn-icon dark" aria-label="Search members" onClick={() => setPhoneSearch(true)}>
                  <Icon name="search" size={20} />
                </button>
                <OverdueBell compact />
                <UserMenu name={user.name} sub={ROLE_LABEL[user.role]} email={user.email} items={menu} compact extra={<LangToggle />} />
              </div>
            </>
          )}
        </header>
        )}

        <main className="main">
          <div className="main-narrow">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ---- Phone: sidebar as a drawer ---- */}
      {drawer && (
        <Drawer label="Menu" onClose={closeDrawer} returnFocus={menuBtn}>
          <div className="drawer-head">
            {brand}
            <button type="button" className="tn-icon dark" aria-label="Close menu" onClick={closeDrawer}>
              <Icon name="close" size={22} />
            </button>
          </div>
          {/* Any link chosen in the drawer closes it (also when it is the current page). */}
          <div className="drawer-body" onClick={(e) => (e.target as HTMLElement).closest("a") && closeDrawer()}>
            {navList}
            {foot}
          </div>
        </Drawer>
      )}
    </div>
  );
}

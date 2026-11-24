import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { fetchAll } from "../lib/api";
import { loadMembers, memberMap } from "../lib/data";
import { dateLabel, initials, taka } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Loan, Member } from "../lib/types";
import { useAsync } from "../lib/useAsync";

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

// ---------- Page title + breadcrumb from the route ----------

export interface PageMeta {
  title: string;
  parent?: { label: string; to: string };
}

export function pageMeta(path: string): PageMeta {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return { title: "Dashboard" };
  if (p === "/members") return { title: "Members" };
  if (p === "/members/new") return { title: "Add member", parent: { label: "Members", to: "/members" } };
  if (/^\/members\/\d+\/edit$/.test(p)) return { title: "Edit member", parent: { label: "Members", to: "/members" } };
  if (/^\/members\/\d+$/.test(p)) return { title: "Member profile", parent: { label: "Members", to: "/members" } };
  if (p === "/collect") return { title: "Record a transaction" };
  if (p === "/ledger") return { title: "Ledger" };
  if (p === "/loans") return { title: "Loans" };
  if (p === "/loans/new") return { title: "New loan", parent: { label: "Loans", to: "/loans" } };
  if (/^\/loans\/\d+$/.test(p)) return { title: `Loan #${p.split("/")[2]}`, parent: { label: "Loans", to: "/loans" } };
  if (p === "/bylaws") return { title: "Bylaws" };
  if (p === "/assistant") return { title: "Assistant" };
  if (p === "/settings") return { title: "Settings" };
  if (p === "/me") return { title: "Home" };
  if (p === "/me/loan") return { title: "My loan" };
  if (p === "/me/history") return { title: "History" };
  if (p === "/me/ask") return { title: "Ask" };
  return { title: "Samity Khata" };
}

export function PageTitle({ meta }: { meta: PageMeta }) {
  const { t } = useI18n();
  return (
    <div className="tn-title">
      {meta.parent && (
        <div className="tn-crumb">
          <Link to={meta.parent.to}>{t(meta.parent.label)}</Link>
          <span aria-hidden="true">/</span>
        </div>
      )}
      <div className="tn-h">{t(meta.title)}</div>
    </div>
  );
}

/** The next 10th (deposits and instalments are due on the 10th, Clauses 3.1 and 4.8). */
export function nextTenth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 10 ? 1 : 0), 10);
}

export function InfoPill({ icon, label, value, tone }: { icon: string; label: string; value: ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className={`tn-pill${tone ? ` ${tone}` : ""}`}>
      <Icon name={icon} size={16} />
      <span className="tn-pill-l">{label}</span>
      <b>{value}</b>
    </div>
  );
}

// ---------- Language ----------

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="tn-lang" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button type="button" className="bn" aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাং</button>
    </div>
  );
}

// ---------- User menu ----------

export interface MenuItem {
  label: string;
  icon: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

export function UserMenu({ name, sub, email, items }: { name: string; sub: string; email?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { t } = useI18n();
  return (
    <div className="tn-pop" ref={ref}>
      <button type="button" className="tn-user" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" style={{ width: 34, height: 34 }}>{initials(name)}</span>
        <span className="tn-user-txt">
          <b>{name}</b>
          <span>{sub}</span>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="tn-menu" role="menu">
          <div className="tn-menu-head">
            <b>{name}</b>
            <span>{email ?? sub}</span>
          </div>
          {items.map((it) =>
            it.to ? (
              <Link key={it.label} to={it.to} role="menuitem" className="tn-mi" onClick={() => setOpen(false)}>
                <Icon name={it.icon} size={16} />
                {t(it.label)}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`tn-mi${it.danger ? " danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                <Icon name={it.icon} size={16} />
                {t(it.label)}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Overdue loans bell (secretary / collector) ----------

async function loadOverdue() {
  const [loans, members] = await Promise.all([fetchAll<Loan>("/loans", { status: "overdue" }), memberMap()]);
  return loans.map((l) => ({ loan: l, member: members.get(l.member_id) ?? null }));
}

export function OverdueBell({ compact }: { compact?: boolean }) {
  const loc = useLocation();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Refresh whenever the user moves to another screen (e.g. after recording a repayment).
  const data = useAsync(loadOverdue, [loc.pathname]);
  const list = data.data ?? [];
  const count = list.length;

  return (
    <div className="tn-pop" ref={ref}>
      <button
        type="button"
        className={`tn-icon${compact ? " dark" : ""}`}
        aria-label={`${count} overdue loan${count === 1 ? "" : "s"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={20} />
        {count > 0 && <span className="tn-badge">{count}</span>}
      </button>
      {open && (
        <div className="tn-menu wide" role="dialog" aria-label="Overdue loans">
          <div className="tn-menu-head">
            <b>{t("Overdue")} · {count}</b>
            <span>Unpaid more than 15 days after the due date (Clause 5.1)</span>
          </div>
          {count === 0 ? (
            <div className="mut" style={{ padding: "12px 14px", fontSize: 14 }}>All clear — no loan is overdue.</div>
          ) : (
            list.slice(0, 6).map(({ loan, member }) => (
              <Link key={loan.id} to={`/loans/${loan.id}`} className="tn-note" onClick={() => setOpen(false)}>
                <span className="avatar" style={{ width: 32, height: 32, fontSize: 12, background: "var(--bad-bg)", color: "var(--bad)" }}>
                  {initials(member?.name ?? "?")}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 14 }}>{member?.name ?? `Member #${loan.member_id}`}</b>
                  <span className="mut" style={{ fontSize: 12 }}>
                    Loan #{loan.id} · next due {dateLabel(loan.next_due_on)}
                  </span>
                </span>
                <b style={{ fontSize: 14, color: "var(--bad)" }}>{taka(loan.due_now_paisa, { decimals: false })}</b>
              </Link>
            ))
          )}
          <Link to="/loans?status=overdue" className="tn-mi" style={{ justifyContent: "center", borderTop: "1px solid var(--line-2)" }} onClick={() => setOpen(false)}>
            View all overdue loans →
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------- Quick member search (Ctrl+K) ----------

export function QuickSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useDismiss(open, () => setOpen(false));
  const members = useAsync(loadMembers, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Member[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return (members.data ?? [])
      .filter((m) => m.name.toLowerCase().includes(s) || m.member_no.toLowerCase().includes(s) || m.phone.includes(s))
      .slice(0, 6);
  }, [q, members.data]);

  const go = (m: Member) => {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    nav(`/members/${m.id}`);
  };

  return (
    <div className="tn-pop tn-search-wrap" ref={ref}>
      <label className="tn-search">
        <Icon name="search" size={16} color="var(--muted)" />
        <span className="sr-only">Find a member</span>
        <input
          ref={inputRef}
          placeholder="Find a member…"
          value={q}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="qs-list"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) go(results[active]);
          }}
        />
        <kbd>Ctrl K</kbd>
      </label>
      {open && q.trim() && (
        <div className="tn-menu" id="qs-list" role="listbox" style={{ left: 0, right: "auto", width: "100%" }}>
          {results.length === 0 ? (
            <div className="mut" style={{ padding: "12px 14px", fontSize: 14 }}>No member matches “{q}”.</div>
          ) : (
            results.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`tn-mi${i === active ? " on" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m)}
              >
                <b style={{ minWidth: 76, fontSize: 13 }}>{m.member_no}</b>
                <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                <span className="mut" style={{ fontSize: 12 }}>{m.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { LoanStatus, TxType } from "../lib/types";
import { useI18n } from "../lib/i18n";

export function Alert({ kind = "bad", children }: { kind?: "ok" | "bad" | "warn" | "neu"; children: ReactNode }) {
  return (
    <div className={`alert ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      <Icon name={kind === "ok" ? "check" : "alert"} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {label ?? t("Loading…")}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Chip({ kind = "neu", children }: { kind?: "ok" | "warn" | "bad" | "neu" | "blu"; children: ReactNode }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

const TX_KIND: Record<TxType, "ok" | "warn" | "bad" | "neu"> = {
  deposit: "ok",
  withdrawal: "warn",
  repayment: "neu",
  reversal: "bad",
};
const TX_LABEL: Record<TxType, string> = { deposit: "Deposit", withdrawal: "Withdrawal", repayment: "Repayment", reversal: "Reversal" };

export function TxChip({ type, extra }: { type: TxType; extra?: string }) {
  const { t } = useI18n();
  return (
    <Chip kind={TX_KIND[type]}>
      {t(TX_LABEL[type])}
      {extra ? ` · ${extra}` : ""}
    </Chip>
  );
}

export function LoanChip({ status }: { status: LoanStatus }) {
  const { t } = useI18n();
  const kind = status === "overdue" ? "bad" : status === "closed" ? "ok" : "neu";
  return <Chip kind={kind}>{t(status[0].toUpperCase() + status.slice(1))}</Chip>;
}

export function Bar({ pct, small }: { pct: number; small?: boolean }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={`bar${small ? " sm" : ""}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${v}%` }} />
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <h2 id="modal-title">{title}</h2>
        {children}
        <div className="actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

export function Pager({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className="pager">
      <span className="mut">
        Showing {from}–{to} of {total}
      </span>
      <div className="pg">
        <button className="pgb" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span className="mut" style={{ padding: "0 8px" }}>
          {page} / {pages}
        </span>
        <button className="pgb" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
    </div>
  );
}

export function PageHead({ title, bn, sub, children }: { title: string; bn?: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="phead">
      <div>
        <h1 className="ptitle">
          {title}
          {bn ? <small className="bn">{bn}</small> : null}
        </h1>
        {sub ? <p className="psub">{sub}</p> : null}
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  );
}

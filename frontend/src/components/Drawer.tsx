import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-in panel over the page (phone navigation).
 * - dimmed backdrop; closes on backdrop click and Escape
 * - focus moves into the drawer, Tab is trapped inside it, and focus returns to `returnFocus` on close
 * - page scroll is locked while open
 */
export function Drawer({
  label,
  onClose,
  returnFocus,
  children,
}: {
  label: string;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement>;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = panel.current;
    const returnTo = returnFocus?.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => (el ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !el?.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus();
    };
  }, [onClose, returnFocus]);

  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={panel} className="side drawer" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </aside>
    </div>
  );
}

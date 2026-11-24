// Money arrives in paisa; people read taka with lakh grouping (Tk 1,86,500.00).

export function taka(paisa: number, opts: { decimals?: boolean; locale?: string } = {}): string {
  const locale = opts.locale ?? "en-IN";
  const decimals = opts.decimals ?? true;
  const n = (paisa / 100).toLocaleString(locale, {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return locale.startsWith("bn") ? `৳ ${n}` : `Tk ${n}`;
}

export function num(n: number, locale = "en-IN") {
  return n.toLocaleString(locale);
}

export function takaToPaisa(input: string): number | null {
  const clean = input.replace(/[,\s]/g, "").replace(/^tk/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

/** ISO date (yyyy-mm-dd) → "24 Nov 2026". Parsed as a local date, never UTC-shifted. */
export function dateLabel(iso: string | null | undefined, locale = "en-GB", withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const loc = locale.startsWith("bn") ? "bn-BD" : "en-GB";
  return dt.toLocaleDateString(loc, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function todayIso(): string {
  const d = new Date();
  return isoOf(d);
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthsBetween(fromIso: string, to = new Date()): number {
  const [y, m, d] = fromIso.split("-").map(Number);
  let months = (to.getFullYear() - y) * 12 + (to.getMonth() + 1 - m);
  if (to.getDate() < d) months -= 1;
  return Math.max(0, months);
}

export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

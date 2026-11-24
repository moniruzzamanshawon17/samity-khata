// Money arrives in paisa; people read taka with lakh grouping (Tk 1,86,500.00 / ৳ ১,৮৬,৫০০.০০).
//
// The helpers below follow the app language (EN / বাং) unless a locale is passed:
// I18nProvider calls setFormatLang() whenever the language changes.

let currentLang: "en" | "bn" = "en";
export function setFormatLang(lang: "en" | "bn") {
  currentLang = lang;
}
const defaultLocale = () => (currentLang === "bn" ? "bn-BD" : "en-IN");

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Writes 0–9 as ০–৯ when the app is in Bangla (for phone numbers and similar). */
export function digits(s: string | number): string {
  const str = String(s);
  return currentLang === "bn" ? str.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : str;
}
export const phone = (p: string) => digits(p);

export function taka(paisa: number, opts: { decimals?: boolean; locale?: string } = {}): string {
  const locale = opts.locale ?? defaultLocale();
  const decimals = opts.decimals ?? true;
  const n = (paisa / 100).toLocaleString(locale, {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return locale.startsWith("bn") ? `৳ ${n}` : `Tk ${n}`;
}

export function num(n: number, locale?: string) {
  return n.toLocaleString(locale ?? defaultLocale());
}

export function takaToPaisa(input: string): number | null {
  // Accept Bangla digits too (৫০০ → 500).
  const ascii = input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const clean = ascii.replace(/[,\s]/g, "").replace(/^(tk|৳)/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

/** ISO date (yyyy-mm-dd) → "24 Nov 2026". Parsed as a local date, never UTC-shifted. */
export function dateLabel(iso: string | null | undefined, locale?: string, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const loc = (locale ?? defaultLocale()).startsWith("bn") ? "bn-BD" : "en-GB";
  return dt.toLocaleDateString(loc, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

/** Locale for Date.toLocaleDateString in the current language. */
export function dateLocale() {
  return currentLang === "bn" ? "bn-BD" : "en-GB";
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

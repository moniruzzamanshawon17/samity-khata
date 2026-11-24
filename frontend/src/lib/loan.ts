import type { Loan, ScheduleRow } from "./types";

/** Clause 4.6/4.7 preview: 1% a month on the reducing balance, EMI rounded up to whole taka. */
export const MONTHLY_RATE = 0.01;
export const TERMS = [6, 12, 18, 24] as const;

export function emiPaisa(principalPaisa: number, months: number, rate = MONTHLY_RATE): number {
  if (principalPaisa <= 0 || months <= 0) return 0;
  const f = Math.pow(1 + rate, months);
  const taka = (principalPaisa / 100) * rate * f / (f - 1);
  return Math.ceil(taka) * 100;
}

export interface PreviewRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

export function previewSchedule(principalPaisa: number, months: number): { emi: number; rows: PreviewRow[]; totalInterest: number } {
  const emi = emiPaisa(principalPaisa, months);
  let bal = principalPaisa;
  let totalInterest = 0;
  const rows: PreviewRow[] = [];
  for (let m = 1; m <= months && bal > 0; m++) {
    const interest = Math.round(bal * MONTHLY_RATE);
    const pay = Math.min(emi, bal + interest);
    const principal = pay - interest;
    bal = Math.max(0, bal - principal);
    totalInterest += interest;
    rows.push({ month: m, interest, principal, balance: bal });
  }
  return { emi, rows, totalInterest };
}

export type RowState = "paid" | "partial" | "next" | "overdue" | "upcoming";

/** Which schedule rows the repayments so far have covered (repayments fill rows in order). */
export function rowStates(rows: ScheduleRow[], loan: Loan, today = new Date()): RowState[] {
  let left = loan.repaid_paisa;
  let nextMarked = false;
  const graceMs = 15 * 86_400_000;
  return rows.map((r) => {
    if (loan.status === "closed") return "paid";
    if (left >= r.payment_paisa) {
      left -= r.payment_paisa;
      return "paid";
    }
    const [y, m, d] = r.due_on.split("-").map(Number);
    const due = new Date(y, m - 1, d).getTime();
    const partial = left > 0;
    left = 0;
    if (today.getTime() > due + graceMs) return "overdue";
    if (!nextMarked) {
      nextMarked = true;
      return partial ? "partial" : "next";
    }
    return "upcoming";
  });
}

export function paidCount(loan: Loan): number {
  if (loan.status === "closed") return loan.term_months;
  if (loan.instalment_paisa <= 0) return 0;
  return Math.min(loan.term_months, Math.floor(loan.repaid_paisa / loan.instalment_paisa));
}

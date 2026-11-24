import { api, fetchAll } from "./api";
import type { Balance, Loan, Member, Samity, Transaction } from "./types";

// Small in-memory cache for lists many screens need (member names, the samity).
// Call invalidate() after a write that changes them.
let membersP: Promise<Member[]> | null = null;
let samitiesP: Promise<Samity[]> | null = null;

export function loadMembers(): Promise<Member[]> {
  if (!membersP) membersP = fetchAll<Member>("/members").catch((e) => ((membersP = null), Promise.reject(e)));
  return membersP;
}

export function loadSamities(): Promise<Samity[]> {
  if (!samitiesP) samitiesP = fetchAll<Samity>("/samities").catch((e) => ((samitiesP = null), Promise.reject(e)));
  return samitiesP;
}

export function invalidate() {
  membersP = null;
  samitiesP = null;
}

export async function memberMap(): Promise<Map<number, Member>> {
  const list = await loadMembers();
  return new Map(list.map((m) => [m.id, m]));
}

export const getBalance = (id: number) => api.get<Balance>(`/members/${id}/balance`);

export async function openLoanOf(memberId: number): Promise<Loan | null> {
  const loans = await fetchAll<Loan>("/loans", { member_id: memberId });
  return loans.find((l) => l.status !== "closed") ?? null;
}

/**
 * A member login (customer) cannot list members or loans. Their own member id
 * and loans are found through their own transactions, which the API scopes to them.
 */
export interface MyAccount {
  member: Member | null;
  balance: Balance | null;
  loan: Loan | null;
  transactions: Transaction[];
}

export async function loadMyAccount(): Promise<MyAccount> {
  const transactions = await fetchAll<Transaction>("/transactions");
  if (transactions.length === 0) return { member: null, balance: null, loan: null, transactions };
  const memberId = transactions[0].member_id;
  const [member, balance] = await Promise.all([api.get<Member>(`/members/${memberId}`), getBalance(memberId)]);
  const loanIds = [...new Set(transactions.filter((t) => t.loan_id !== null).map((t) => t.loan_id as number))].sort((a, b) => b - a);
  let loan: Loan | null = null;
  for (const id of loanIds) {
    const l = await api.get<Loan>(`/loans/${id}`);
    if (l.status !== "closed") {
      loan = l;
      break;
    }
    loan ??= l;
  }
  return { member, balance, loan, transactions: transactions.filter((t) => t.member_id === memberId) };
}

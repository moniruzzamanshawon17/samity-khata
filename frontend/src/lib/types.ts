// Mirrors the backend's Pydantic response schemas. Money is always paisa (1 taka = 100 paisa).

export type Role = "admin" | "staff" | "customer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface Samity {
  id: number;
  name: string;
  union: string;
  monthly_deposit_paisa: number;
  bylaw_document_id: number | null;
  created_at: string;
  updated_at: string;
}

export type MemberStatus = "active" | "inactive";

export interface Member {
  id: number;
  samity_id: number;
  member_no: string;
  name: string;
  phone: string;
  user_id: number | null;
  joined_on: string;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface MemberInput {
  samity_id?: number;
  member_no?: string;
  name?: string;
  phone?: string;
  user_id?: number | null;
  joined_on?: string;
  status?: MemberStatus;
}

export interface Balance {
  member_id: number;
  total_deposits_paisa: number;
  total_withdrawals_paisa: number;
  total_repayments_paisa: number;
  savings_balance_paisa: number;
  monthly_deposit_paisa: number;
  unpaid_deposits: number;
  bylaw_status: string;
  max_withdrawal_paisa: number;
  loan_ceiling_paisa: number;
}

export type TxType = "deposit" | "withdrawal" | "repayment" | "reversal";

export interface Transaction {
  id: number;
  member_id: number;
  type: TxType;
  amount_paisa: number;
  occurred_on: string;
  recorded_by: number;
  loan_id: number | null;
  reverses_id: number | null;
  reversed_by_id: number | null;
  created_at: string;
}

export interface TransactionInput {
  member_id: number;
  type: "deposit" | "withdrawal" | "repayment";
  amount_paisa: number;
  occurred_on: string;
  loan_id: number | null;
}

export type LoanStatus = "active" | "closed" | "overdue";

export interface Loan {
  id: number;
  member_id: number;
  principal_paisa: number;
  annual_rate_bp: number;
  term_months: number;
  instalment_paisa: number;
  start_on: string;
  status: LoanStatus;
  closed_on: string | null;
  created_at: string;
  updated_at: string;
  principal_outstanding_paisa: number;
  interest_charged_paisa: number;
  interest_due_paisa: number;
  repaid_paisa: number;
  outstanding_paisa: number;
  due_now_paisa: number;
  next_due_on: string | null;
}

export interface ScheduleRow {
  month: number;
  due_on: string;
  payment_paisa: number;
  interest_paisa: number;
  principal_paisa: number;
  balance_after_paisa: number;
}

export interface LoanSchedule {
  loan_id: number;
  instalment_paisa: number;
  total_interest_paisa: number;
  rows: ScheduleRow[];
}

export interface BylawDocument {
  id: number;
  title: string;
  filename: string;
  chunk_count: number;
  samity_id: number | null;
  uploaded_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface IngestResult extends BylawDocument {
  replaced: boolean;
  languages: Record<string, number>;
}

export interface BylawHit {
  document_id: number;
  document_title: string;
  position: number;
  chunk_text: string;
  source_language: string;
  similarity: number;
}

export interface BylawSearchResult {
  query: string;
  threshold: number;
  hits: BylawHit[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolUse {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatResponse {
  reply: string;
  sources: string[];
  tools_used: ToolUse[];
}

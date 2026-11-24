import type { Page } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api/v1";
const TOKEN_KEY = "sk.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

export function getToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (Date.now() >= t.expiresAt) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t.token;
  } catch {
    return null;
  }
}

export function setToken(token: string | null, expiresInSeconds = 3600) {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else
      localStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 } satisfies StoredToken),
      );
  } catch {
    /* storage blocked: the session just won't survive a reload */
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ""}`;
}

/** FastAPI sends `detail` as a string (our errors) or a list (422 validation). */
function messageFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = (d.loc ?? []).filter((p) => p !== "body" && p !== "query").join(".");
        const msg = (d.msg ?? "Invalid value").replace(/^Value error, /, "");
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" · ");
  }
  if (status === 0) return "Cannot reach the server. Is the API running?";
  return `Request failed (${status})`;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // cancelled by the caller (Stop / timeout)
    throw new ApiError(0, messageFrom(null, 0));
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) onUnauthorized();
    throw new ApiError(res.status, messageFrom(data, res.status));
  }
  return data as T;
}

/** For callers that need the raw Response (e.g. reading a stream): URL + auth header. */
export function apiUrl(path: string) {
  return buildUrl(path);
}
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Turns a non-OK Response into an ApiError (and signs out on 401). */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401) onUnauthorized();
  return new ApiError(res.status, messageFrom(data, res.status));
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, opts: { auth?: boolean; signal?: AbortSignal } = {}) =>
    request<T>("POST", path, { body, ...opts }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  del: (path: string) => request<void>("DELETE", path),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
};

/** Walks every page of a list endpoint (the API caps size at 100). */
export async function fetchAll<T>(path: string, query: Query = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await api.get<Page<T>>(path, { ...query, page, size: 100 });
    out.push(...res.items);
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out;
}

/** Runs async jobs with a small concurrency limit, keeping input order. */
export async function mapLimit<A, B>(items: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.status ? `${e.status} · ${e.message}` : e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

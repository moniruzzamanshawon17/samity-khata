import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import markUrl from "../assets/brand/samity-khata-mark.svg";
import { api, ApiError } from "../lib/api";
import { streamChat } from "../lib/chatStream";
import { PHONE } from "../lib/useMedia";
import { useI18n } from "../lib/i18n";
import type { ChatResponse, ChatTurn, ToolUse } from "../lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  tools?: ToolUse[];
  error?: boolean;
}

/** Give up after this long with no sign of life (reset by every streamed event). */
const TIMEOUT_MS = 90_000;

const TOOL_WORDS: Record<string, string> = {
  find_members: "Finding the member",
  get_member: "Reading the member record",
  get_balance: "Checking the balance",
  list_transactions: "Reading transactions",
  get_loans: "Checking loans",
  get_loan_schedule: "Reading the loan schedule",
  search_bylaws: "Searching the bylaws",
};

/** One plain sentence per tool call, filled in with the call's arguments. */
const STEP_TEXT: Record<string, (a: Record<string, unknown>) => string> = {
  find_members: (a) => `Searched members for “${a.query ?? ""}”`,
  get_member: (a) => `Opened member ${a.member_id ?? ""}`,
  get_balance: (a) => `Checked savings of member ${a.member_id ?? ""}`,
  list_transactions: (a) => `Read the ledger of member ${a.member_id ?? ""}`,
  get_loans: (a) => `Checked loans of member ${a.member_id ?? ""}`,
  get_loan_schedule: (a) => `Read the schedule of loan ${a.loan_id ?? ""}`,
  search_bylaws: () => "Searched the bylaws",
};

function stepText(t: ToolUse) {
  return (STEP_TEXT[t.name] ?? (() => `Used ${t.name}`))(t.args ?? {});
}

/** Scrolls so the newest message sits just above the (sticky) message box. */
function keepLatestInView() {
  window.scrollTo({ top: document.documentElement.scrollHeight });
}

/** "Looked up: …" line under a reply; nothing when no tool was used. */
function LookedUp({ tools, label }: { tools?: ToolUse[]; label: string }) {
  if (!tools?.length) return null;
  return (
    <div className="looked-up">
      {label} {tools.map(stepText).join(" · ")}
    </div>
  );
}

/** Restores the saved conversation. A question left without a reply (page reloaded
 *  mid-request) gets a failed answer so it can be retried instead of breaking the thread. */
function load(key: string): ChatMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "[]") as ChatMessage[];
    if (saved.length && saved[saved.length - 1].role === "user") {
      saved.push({ role: "assistant", content: "This question didn't get an answer — the page was reloaded while the assistant was working.", error: true });
    }
    return saved;
  } catch {
    return [];
  }
}

/** Only complete question → answer pairs go to the model as history (max 20 turns). */
function historyOf(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const q = messages[i];
    const a = messages[i + 1];
    if (q.role === "user" && a.role === "assistant" && !a.error) {
      turns.push({ role: "user", content: q.content.slice(0, 4000) }, { role: "assistant", content: a.content.slice(0, 4000) });
      i++;
    }
  }
  return turns.slice(-20);
}

function failureText(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "";
  if (e instanceof ApiError) {
    if (e.status === 503) return `${e.message}. The AI service is busy or its daily quota is used up — please try again later.`;
    if (e.status === 0) return e.message;
    return `${e.status} · ${e.message}`;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

const STAGES = ["Reading your question…", "Looking up records and bylaws…", "Writing the answer…"];

export function Chat({
  storageKey,
  suggestions,
  showTools = true,
  resetSignal,
  note,
}: {
  storageKey: string;
  suggestions: string[];
  showTools?: boolean;
  resetSignal?: number;
  /** Small muted text shown directly under the message box. */
  note?: string;
}) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(storageKey));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<{ text: string; tools: ToolUse[] } | null>(null);
  const liveRef = useRef<{ text: string; tools: ToolUse[] }>({ text: "", tools: [] });
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<{ ctrl: AbortController; reason: "stop" | "timeout" | null } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages, storageKey]);

  // Keep the newest message (and the working indicator) in view.
  useEffect(() => {
    const log = logRef.current;
    if (!log || (messages.length === 0 && !busy)) return;
    if (log.scrollHeight > log.clientHeight) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    else window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [messages, busy, live?.text.length, live?.tools.length]);

  // Phone keyboard: when it opens (the visual viewport shrinks) keep the latest message and the input in view.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const typing = (document.activeElement as HTMLElement | null)?.closest(".composer");
      if (typing && window.matchMedia(PHONE).matches) keepLatestInView();
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Elapsed-seconds counter while waiting.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => {
    if (resetSignal) {
      abortRef.current?.ctrl.abort();
      setMessages([]);
    }
  }, [resetSignal]);

  // Leaving the page cancels the request.
  useEffect(() => () => abortRef.current?.ctrl.abort(), []);

  async function send(message: string, retry = false) {
    const msg = message.trim();
    if (!msg || busy) return;
    // A retry replaces the failed question + error instead of piling up.
    const base = retry && messages.length >= 2 && messages[messages.length - 1].error ? messages.slice(0, -2) : messages;
    const history = historyOf(base);
    setMessages([...base, { role: "user", content: msg }]);
    setText("");
    setBusy(true);

    const ctrl = new AbortController();
    const slot = { ctrl, reason: null as "stop" | "timeout" | null };
    abortRef.current = slot;
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        slot.reason = "timeout";
        ctrl.abort();
      }, TIMEOUT_MS);
    };
    arm();
    liveRef.current = { text: "", tools: [] };
    setLive({ text: "", tools: [] });
    const push = () => setLive({ ...liveRef.current, tools: [...liveRef.current.tools] });

    const body = { message: msg.slice(0, 2000), history };
    try {
      // Stream when the backend offers /chat/stream; otherwise fall back to the one-shot /chat.
      const res =
        (await streamChat(body, {
          signal: ctrl.signal,
          onActivity: arm,
          onTool: (tool) => {
            liveRef.current.tools.push(tool);
            push();
          },
          onDelta: (piece) => {
            liveRef.current.text += piece;
            push();
          },
        })) ?? (await api.post<ChatResponse>("/chat", body, { signal: ctrl.signal }));
      setMessages((ms) => [...ms, { role: "assistant", content: res.reply, sources: res.sources, tools: res.tools_used }]);
    } catch (e) {
      const partial = liveRef.current.text.trim();
      const why =
        slot.reason === "stop"
          ? "Stopped. You can retry or ask something else."
          : slot.reason === "timeout"
            ? `No answer after ${TIMEOUT_MS / 1000} seconds. The AI service may be slow or out of quota — please retry.`
            : failureText(e);
      // Keep whatever text already arrived; it is marked failed so it is not sent back as history.
      const content = partial
        ? `${partial}\n\n— ${slot.reason === "stop" ? "Stopped before the answer finished. Retry for the full answer." : `Interrupted: ${why}`}`
        : why;
      if (content) setMessages((ms) => [...ms, { role: "assistant", content, error: true, tools: liveRef.current.tools }]);
    } finally {
      clearTimeout(timer);
      setLive(null);
      if (abortRef.current === slot) abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    if (abortRef.current) {
      abortRef.current.reason = "stop";
      abortRef.current.ctrl.abort();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(text);
    }
  }

  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content;
  // Real progress when streaming (the last tool the model called), a time-based guess otherwise.
  const lastTool = live?.tools[live.tools.length - 1];
  const stage = lastTool
    ? `${t(TOOL_WORDS[lastTool.name] ?? "Looking things up")}…`
    : t(STAGES[Math.min(STAGES.length - 1, Math.floor(elapsed / 6))]);
  const streaming = !!live?.text;

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef} aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && !busy && (
          <div className="mut" style={{ margin: "auto", textAlign: "center", maxWidth: 360, fontSize: 14, lineHeight: 1.6 }}>
            <img src={markUrl} alt="" width={56} className="brand-img" style={{ margin: "0 auto 12px" }} />
            {t("Ask about a member, a loan, a balance or a bylaw rule — in Bangla or English. Answers about rules cite the clause.")}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="me">
              {m.content}
            </div>
          ) : (
            <div key={i} className="bot">
              <div className={`bub${m.error ? " err" : ""}`} style={{ whiteSpace: "normal" }}>
                <Markdown text={m.content} />
                {m.error && i === messages.length - 1 && lastQuestion && !busy && (
                  <button type="button" className="btn" style={{ marginTop: 10, minHeight: 36 }} onClick={() => send(lastQuestion, true)}>
                    ↻ Retry
                  </button>
                )}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="chips">
                  <span className="mut" style={{ fontSize: 12 }}>{t("Sources")}</span>
                  {m.sources.map((s) => (
                    <span key={s} className="src">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {showTools && <LookedUp tools={m.tools} label={t("Looked up:")} />}
            </div>
          ),
        )}
        {busy && streaming && live && (
          <div className="bot">
            <div className="bub live" style={{ whiteSpace: "normal" }}>
              <Markdown text={live.text} />
              <span className="caret" aria-hidden="true" />
            </div>
            {showTools && <LookedUp tools={live.tools} label={t("Looked up:")} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} role="status">
              <span className="spinner" aria-hidden="true" style={{ width: 14, height: 14, margin: 0 }} />
              <span className="mut" style={{ fontSize: 12 }}>{t("Writing the answer…")} {elapsed}s</span>
              <button type="button" className="linkbtn" onClick={stop}>Stop</button>
            </div>
          </div>
        )}
        {busy && !streaming && (
          <div className="bot" role="status">
            <div className="bub working">
              <span className="spinner" aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 14 }}>{stage}</b>
                <span className="mut" style={{ fontSize: 12 }}>
                  {elapsed}s{elapsed >= 10 ? " · checking the ledger can take up to a minute" : ""}
                </span>
              </span>
              <button type="button" className="btn" style={{ minHeight: 34, padding: "0 12px" }} onClick={stop}>
                Stop
              </button>
            </div>
            <div className="workbar" aria-hidden="true"><div /></div>
          </div>
        )}
      </div>
      <div className="composer">
        {messages.length < 2 && !busy && (
          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} type="button" className="sug" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit}>
          <label style={{ flex: 1 }}>
            <span className="sr-only">Message</span>
            <textarea
              rows={2}
              maxLength={2000}
              placeholder={busy ? t("Thinking…") : t("Type your question…")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => {
                if (window.matchMedia(PHONE).matches) setTimeout(keepLatestInView, 300);
              }}
            />
          </label>
          {busy ? (
            <button className="sendbtn" type="button" onClick={stop} aria-label="Stop" title="Stop" style={{ background: "var(--ink-2)" }}>
              <span style={{ width: 14, height: 14, background: "#fff", borderRadius: 3 }} />
            </button>
          ) : (
            <button className="sendbtn" type="submit" aria-label={t("Send")} disabled={!text.trim()}>
              <Icon name="send" size={20} />
            </button>
          )}
        </form>
        {note && <p className="chat-note">{note}</p>}
      </div>
    </div>
  );
}

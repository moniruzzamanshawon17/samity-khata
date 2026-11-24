import { ApiError, apiErrorFrom, apiUrl, authHeaders } from "./api";
import type { ChatResponse, ChatTurn, ToolUse } from "./types";

/*
 * Streaming chat client.
 *
 * Contract (the backend endpoint is POST /api/v1/chat/stream, same JSON body as /chat):
 *   Errors before the answer starts → a normal JSON error response (401, 503, …).
 *   Otherwise `Content-Type: text/event-stream`, a sequence of Server-Sent Events:
 *     event: tool   data: {"name": "get_balance", "args": {"member_id": 1}}
 *     event: delta  data: {"text": "Your balance is "}
 *     event: done   data: {"reply": "...", "sources": ["3.3"], "tools_used": [...]}   (same shape as /chat)
 *     event: error  data: {"status": 503, "detail": "The chat model is busy"}
 *
 * If the endpoint doesn't exist (404/405) this returns null and the caller falls back to POST /chat.
 */

export interface StreamHandlers {
  signal: AbortSignal;
  onTool?: (t: ToolUse) => void;
  onDelta?: (text: string) => void;
  /** Called on every event; used to reset an idle timeout. */
  onActivity?: () => void;
}

let streamUnsupported = false;

export async function streamChat(body: { message: string; history: ChatTurn[] }, h: StreamHandlers): Promise<ChatResponse | null> {
  if (streamUnsupported) return null;

  const res = await fetch(apiUrl("/chat/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
    body: JSON.stringify(body),
    signal: h.signal,
  }).catch((e) => {
    if (h.signal.aborted) throw e;
    throw new ApiError(0, "Cannot reach the server. Is the API running?");
  });

  if (res.status === 404 || res.status === 405) {
    streamUnsupported = true; // remember for this page load: go straight to /chat next time
    return null;
  }
  if (!res.ok) throw await apiErrorFrom(res);

  // A server that answers with plain JSON instead of a stream still works.
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return (await res.json()) as ChatResponse;
  }
  if (!res.body) throw new ApiError(0, "This browser cannot read streamed answers");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  const tools: ToolUse[] = [];
  let final: ChatResponse | null = null;

  const handle = (event: string, data: string) => {
    h.onActivity?.();
    let payload: Record<string, unknown> = {};
    try {
      payload = data ? JSON.parse(data) : {};
    } catch {
      return; // ignore a malformed event rather than failing the whole answer
    }
    if (event === "tool") {
      const t = { name: String(payload.name ?? "tool"), args: (payload.args as Record<string, unknown>) ?? {} };
      tools.push(t);
      h.onTool?.(t);
    } else if (event === "delta") {
      const piece = String(payload.text ?? "");
      text += piece;
      h.onDelta?.(piece);
    } else if (event === "done") {
      final = {
        reply: String(payload.reply ?? text),
        sources: (payload.sources as string[]) ?? [],
        tools_used: (payload.tools_used as ToolUse[]) ?? tools,
      };
    } else if (event === "error") {
      throw new ApiError(Number(payload.status ?? 503), String(payload.detail ?? "The assistant stopped with an error"));
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    // SSE events are separated by a blank line.
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      let event = "message";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith(":")) continue; // comment / keep-alive
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (event !== "message" || data.length) handle(event, data.join("\n"));
    }
    if (done) break;
  }

  if (final) return final;
  if (text) return { reply: text, sources: [], tools_used: tools };
  throw new ApiError(0, "The answer stream ended before any text arrived");
}

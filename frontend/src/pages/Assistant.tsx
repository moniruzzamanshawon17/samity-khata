import { useCallback, useState } from "react";
import { Chat, toolLabel, type ChatMessage } from "../components/Chat";
import { PageHead } from "../components/ui";
import { useAuth } from "../lib/auth";

const TOOLS = ["find_members", "get_member", "get_balance", "list_transactions", "get_loans", "get_loan_schedule", "search_bylaws"];

export function Assistant() {
  const { user } = useAuth();
  const [last, setLast] = useState<ChatMessage | null>(null);
  const [reset, setReset] = useState(0);
  const onAnswer = useCallback((m: ChatMessage | null) => setLast(m), []);

  return (
    <>
      <PageHead
        title="Assistant"
        bn="সহকারী"
        sub="Ask in Bangla or English. It can only look things up — never change records — and only what you are allowed to see."
      >
        <button className="btn" type="button" onClick={() => setReset((r) => r + 1)}>
          + New chat
        </button>
      </PageHead>
      <div className="row" style={{ alignItems: "stretch" }}>
        <section className="card col-3" style={{ flexBasis: 520 }}>
          <Chat
            storageKey={`sk.chat.${user?.id}`}
            resetSignal={reset}
            onAnswer={onAnswer}
            suggestions={["Who is overdue this month?", "দেরিতে জমা দিলে জরিমানা কত?", "Can Rahima take a second loan?"]}
          />
        </section>
        <aside className="card pad" style={{ flex: "1 1 280px", alignSelf: "flex-start" }}>
          <h2 style={{ marginBottom: 4 }}>What it did</h2>
          <p className="mut" style={{ margin: "0 0 10px", fontSize: 13 }}>Last answer, step by step</p>
          {last?.tools?.length ? (
            <>
              {last.tools.map((t, i) => (
                <div className="step" key={i}>
                  <span className="mut">{i + 1}</span>
                  <span>
                    Model called <code>{toolLabel(t)}</code>
                  </span>
                </div>
              ))}
              <div className="step" style={{ borderBottom: 0 }}>
                <span className="mut">{last.tools.length + 1}</span>
                <span>Answer written from those results{last.sources?.length ? `, citing ${last.sources.join(", ")}` : ""}</span>
              </div>
            </>
          ) : (
            <p className="mut" style={{ fontSize: 13 }}>{last ? "Answered without calling a tool." : "No answer yet."}</p>
          )}
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--surface-2)", fontSize: 13, lineHeight: 1.55 }}>
            <b>Tools available</b>
            <br />
            {TOOLS.join(" · ")}
          </div>
          <p className="mut" style={{ fontSize: 12, marginTop: 12 }}>History is sent with each message (up to 20 turns) and kept in this browser tab only.</p>
        </aside>
      </div>
    </>
  );
}

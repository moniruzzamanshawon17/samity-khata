import { useState } from "react";
import { Chat } from "../components/Chat";
import { PageHead } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export function Assistant() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [reset, setReset] = useState(0);

  return (
    <>
      <PageHead
        title={t("Assistant")}
        bn={lang === "en" ? "সহকারী" : undefined}
        sub={t("Ask in Bangla or English. It can only look things up — never change records — and only what you are allowed to see.")}
      >
        <button className="btn" type="button" onClick={() => setReset((r) => r + 1)}>
          + {t("New chat")}
        </button>
      </PageHead>
      <section className="card assistant-chat">
        <Chat
          storageKey={`sk.chat.${user?.id}`}
          resetSignal={reset}
          suggestions={["Karim Mia-র লোনের অবস্থা কী?", "দেরিতে জমা দিলে জরিমানা কত?", "Can Rahima take a second loan?"]}
          note={t("This conversation is cleared when you close the tab.")}
        />
      </section>
    </>
  );
}

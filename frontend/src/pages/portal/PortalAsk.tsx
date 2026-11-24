import { Chat } from "../../components/Chat";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { PortalHeader } from "./PortalHome";

export function PortalAsk() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const suggestions =
    lang === "bn"
      ? ["আমার ব্যালেন্স কত?", "পরের কিস্তি কবে?", "দেরিতে জমা দিলে জরিমানা কত?"]
      : ["What is my balance?", "When is my next instalment?", "What is the fine for a late deposit?"];
  return (
    <>
      <PortalHeader title={t("Samity assistant")} sub={t("Can only see your own records")} flat />
      <Chat storageKey={`sk.chat.${user?.id}`} suggestions={suggestions} showTools={false} />
    </>
  );
}

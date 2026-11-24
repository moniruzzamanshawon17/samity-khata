import { Alert, Loading } from "../../components/ui";
import { useMyAccount } from "../../components/PortalShell";
import { useI18n } from "../../lib/i18n";
import { dateLabel, taka } from "../../lib/format";
import type { Transaction } from "../../lib/types";
import { NotLinked, PortalHeader } from "./PortalHome";

const META: Record<Transaction["type"], { label: string; ic: string; bg: string; fg: string }> = {
  deposit: { label: "Deposit", ic: "+", bg: "var(--ok-bg)", fg: "var(--ok)" },
  withdrawal: { label: "Withdrawal", ic: "−", bg: "var(--warn-bg)", fg: "var(--warn)" },
  repayment: { label: "Repayment", ic: "↺", bg: "var(--neu-bg)", fg: "var(--ink-2)" },
  reversal: { label: "Reversal", ic: "×", bg: "var(--bad-bg)", fg: "var(--bad)" },
};

export function PortalTx({ tx }: { tx: Transaction }) {
  const { t, locale } = useI18n();
  const m = META[tx.type];
  return (
    <div className="p-tx" style={tx.reversed_by_id ? { opacity: 0.55 } : undefined}>
      <div className="p-ic" style={{ background: m.bg, color: m.fg }}>{m.ic}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t(m.label)}</div>
        <div className="mut" style={{ fontSize: 12 }}>
          {dateLabel(tx.occurred_on, locale)}
          {tx.loan_id ? ` · #${tx.loan_id}` : ""}
          {tx.reverses_id ? ` · #${tx.reverses_id}` : ""}
        </div>
      </div>
      <b style={{ fontSize: 14, textDecoration: tx.reversed_by_id ? "line-through" : undefined }}>
        {tx.type === "reversal" ? "− " : ""}
        {taka(tx.amount_paisa, { locale, decimals: false })}
      </b>
    </div>
  );
}

export function PortalHistory() {
  const { t } = useI18n();
  const { data, loading, error } = useMyAccount();
  return (
    <>
      <PortalHeader title={t("History")} sub={data?.member?.member_no} flat />
      <div className="p-body">
        {loading ? (
          <Loading />
        ) : error ? (
          <Alert>{error}</Alert>
        ) : !data?.member ? (
          <NotLinked />
        ) : (
          <div className="p-card" style={{ padding: "4px 16px" }}>
            {data.transactions.map((tx) => <PortalTx key={tx.id} tx={tx} />)}
          </div>
        )}
      </div>
    </>
  );
}

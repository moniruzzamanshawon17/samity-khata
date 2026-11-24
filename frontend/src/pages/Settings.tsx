import { useEffect, useState, type FormEvent } from "react";
import { Alert, Chip, Loading, PageHead } from "../components/ui";
import { api, errorText } from "../lib/api";
import { ROLE_LABEL, useAuth } from "../lib/auth";
import { invalidate, loadSamities } from "../lib/data";
import { takaToPaisa } from "../lib/format";
import type { BylawDocument, Samity } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const MCP_URL = (import.meta.env.VITE_MCP_URL as string | undefined) || "http://localhost:8003/mcp";

const ROLES = [
  { role: "Admin (secretary)", chip: "ok" as const, can: "Everything: members, loans, withdrawals, reversals, bylaw upload, settings" },
  { role: "Staff (collector)", chip: "blu" as const, can: "Deposits and repayments only; reads members, ledger and loans" },
  { role: "Member", chip: "neu" as const, can: "Own savings, loan and history in the member app; 403 on anyone else" },
];

export function Settings() {
  const { user } = useAuth();
  const data = useAsync(async () => {
    const [samities, docs] = await Promise.all([loadSamities(), api.get<BylawDocument[]>("/bylaws")]);
    return { samity: samities[0] ?? null, docs };
  }, []);
  const [form, setForm] = useState<{ name: string; union: string; deposit: string; bylaw: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = data.data?.samity;
    if (s) setForm({ name: s.name, union: s.union, deposit: String(s.monthly_deposit_paisa / 100), bylaw: s.bylaw_document_id ? String(s.bylaw_document_id) : "" });
  }, [data.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const s = data.data?.samity;
    if (!s || !form) return;
    const deposit = takaToPaisa(form.deposit);
    if (!deposit) {
      setMsg({ kind: "bad", text: "Monthly deposit must be an amount in taka." });
      return;
    }
    const body: Record<string, unknown> = {};
    if (form.name.trim() !== s.name) body.name = form.name.trim();
    if (form.union.trim() !== s.union) body.union = form.union.trim();
    if (deposit !== s.monthly_deposit_paisa) body.monthly_deposit_paisa = deposit;
    const bylaw = form.bylaw ? Number(form.bylaw) : null;
    if (bylaw !== s.bylaw_document_id) body.bylaw_document_id = bylaw;
    if (!Object.keys(body).length) {
      setMsg({ kind: "ok", text: "Nothing changed." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.patch<Samity>(`/samities/${s.id}`, body);
      invalidate();
      data.reload();
      setMsg({ kind: "ok", text: "Samity details saved." });
    } catch (err) {
      setMsg({ kind: "bad", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  if (data.loading) return <Loading />;
  if (data.error) return <Alert>{data.error}</Alert>;

  return (
    <>
      <PageHead title="Settings" />
      <div className="row">
        <div className="col-3 stack">
          <section className="card" style={{ padding: 24 }}>
            <h2 style={{ marginBottom: 16 }}>Samity details</h2>
            {!data.data?.samity || !form ? (
              <p className="mut">No samity yet. Run the seed script or create one with POST /api/v1/samities.</p>
            ) : (
              <form onSubmit={save} className="stack" style={{ gap: 18 }}>
                {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
                <div className="fgrid">
                  <div className="full">
                    <label className="lbl" htmlFor="sn">Name</label>
                    <input className="inp" id="sn" maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="un">Union</label>
                    <input className="inp" id="un" maxLength={100} value={form.union} onChange={(e) => setForm({ ...form, union: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="md">Monthly deposit (Tk)</label>
                    <input className="inp" id="md" inputMode="decimal" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
                    <div className="hint">Due on the 10th (Clause 3.1)</div>
                  </div>
                  <div className="full">
                    <label className="lbl" htmlFor="bd">Bylaw document</label>
                    <select className="inp" id="bd" value={form.bylaw} onChange={(e) => setForm({ ...form, bylaw: e.target.value })}>
                      <option value="">— none —</option>
                      {data.data.docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} · {d.chunk_count} clauses
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-foot">
                  <button className="btn pri" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Roles &amp; permissions</h2>
            </div>
            <div className="tbl-wrap">
              <table className="t">
                <thead><tr><th>Role</th><th>Can do</th></tr></thead>
                <tbody>
                  {ROLES.map((r) => (
                    <tr key={r.role}>
                      <td><Chip kind={r.chip}>{r.role}</Chip></td>
                      <td className="mut" style={{ whiteSpace: "normal" }}>{r.can}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pad mut" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Members sign up themselves (Register). Admin and collector accounts are created by the secretary with <code>scripts/create_user.py</code>. You are signed in as <b>{user?.name}</b> ({user?.email}) · {user ? ROLE_LABEL[user.role] : ""}.
            </div>
          </section>
        </div>

        <div className="col-2 stack">
          <section className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2>Connect an AI client (MCP)</h2>
              <Chip kind="ok">Read-only</Chip>
            </div>
            <p className="mut" style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55 }}>
              Use Samity Khata from Claude Desktop or any MCP client, with your own permissions.
            </p>
            <div className="lbl">HTTP endpoint (Bearer token from login)</div>
            <code className="code">{MCP_URL}</code>
            <div className="lbl" style={{ marginTop: 14 }}>Local (stdio)</div>
            <code className="code">{`MCP_USER_EMAIL=${user?.email ?? "you@example.com"}\npython -m app.mcp`}</code>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 16, textAlign: "center" }}>
              {[["8", "tools"], ["4", "resources"], ["3", "prompts"]].map(([n, l]) => (
                <div key={l} style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div>
                  <div className="mut" style={{ fontSize: 12 }}>{l}</div>
                </div>
              ))}
            </div>
            <div className="mut" style={{ fontSize: 12, marginTop: 10 }}>Prompts: member_summary · explain_rule · loan_eligibility</div>
          </section>
          <section className="card pad">
            <h2 style={{ marginBottom: 8 }}>Plan</h2>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Samity Basic</div>
            <div className="mut" style={{ fontSize: 14 }}>Monthly subscription per samity</div>
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
              <li>Members, ledger and loans for one samity</li>
              <li>Bangla + English assistant</li>
              <li>MCP access for AI clients</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

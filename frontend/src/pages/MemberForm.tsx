import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Loading, Modal } from "../components/ui";
import { api, ApiError, errorText } from "../lib/api";
import { invalidate, loadMembers, loadSamities } from "../lib/data";
import { todayIso } from "../lib/format";
import type { Member, MemberInput, MemberStatus, Samity } from "../lib/types";

interface FormState {
  samity_id: string;
  member_no: string;
  name: string;
  phone: string;
  user_id: string;
  joined_on: string;
  status: MemberStatus;
}

function nextMemberNo(members: Member[]): string {
  const nums = members.map((m) => /(\d+)$/.exec(m.member_no)?.[1]).filter(Boolean).map(Number);
  const prefix = members[0]?.member_no.replace(/\d+$/, "") || "SSR-";
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export function MemberForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const nav = useNavigate();
  const [samities, setSamities] = useState<Samity[]>([]);
  const [original, setOriginal] = useState<Member | null>(null);
  const [f, setF] = useState<FormState | null>(null);
  const [suggested, setSuggested] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ss, members] = await Promise.all([loadSamities(), loadMembers()]);
        setSamities(ss);
        const next = nextMemberNo(members);
        setSuggested(next);
        if (editing) {
          const m = await api.get<Member>(`/members/${id}`);
          setOriginal(m);
          setF({
            samity_id: String(m.samity_id),
            member_no: m.member_no,
            name: m.name,
            phone: m.phone,
            user_id: m.user_id ? String(m.user_id) : "",
            joined_on: m.joined_on,
            status: m.status,
          });
        } else {
          setF({ samity_id: String(ss[0]?.id ?? ""), member_no: next, name: "", phone: "", user_id: "", joined_on: todayIso(), status: "active" });
        }
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [editing, id]);

  if (error && !f) return <Alert>{error}</Alert>;
  if (!f) return <Loading />;
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as FormState);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErr(null);
    const full: MemberInput = {
      samity_id: Number(f!.samity_id),
      member_no: f!.member_no.trim(),
      name: f!.name.trim(),
      phone: f!.phone.trim(),
      user_id: f!.user_id ? Number(f!.user_id) : null,
      joined_on: f!.joined_on,
      status: f!.status,
    };
    try {
      let saved: Member;
      if (editing && original) {
        // PATCH only what changed; samity can't move.
        const diff: MemberInput = {};
        (["member_no", "name", "phone", "user_id", "joined_on", "status"] as const).forEach((k) => {
          if (full[k] !== original[k]) (diff as Record<string, unknown>)[k] = full[k];
        });
        saved = Object.keys(diff).length ? await api.patch<Member>(`/members/${id}`, diff) : original;
      } else {
        if (full.user_id === null) delete full.user_id;
        saved = await api.post<Member>("/members", full);
      }
      invalidate();
      nav(`/members/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFieldErr(err.message);
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setDeleteError(null);
    try {
      await api.del(`/members/${id}`);
      invalidate();
      nav("/members");
    } catch (err) {
      setConfirmDelete(false);
      setDeleteError(errorText(err));
    }
  }

  return (
    <>
      <Link className="back" to={editing ? `/members/${id}` : "/members"}>
        ← {editing ? original?.name : "Members"}
      </Link>
      <h1 className="ptitle" style={{ marginBottom: 4 }}>
        {editing ? "Edit member" : "Add member"}
      </h1>
      <p className="psub" style={{ marginBottom: 20 }}>
        {editing ? "Only changed fields are sent." : "The member number must be unique in the samity and is never reused (Clause 2.3)."}
      </p>

      <div className="row">
        <form className="card pad col-3 stack" onSubmit={submit} style={{ padding: 24 }}>
          {error && <Alert>{error}</Alert>}
          <div className="fgrid">
            <div>
              <label className="lbl" htmlFor="no">Member number</label>
              <input className={`inp${fieldErr ? " err" : ""}`} id="no" required maxLength={20} value={f.member_no} onChange={set("member_no")} />
              {fieldErr ? (
                <div className="emsg">
                  {fieldErr}
                  {!editing && suggested ? ` Next free: ${suggested}` : ""}
                </div>
              ) : null}
            </div>
            <div>
              <label className="lbl" htmlFor="sm">Samity</label>
              <select className="inp" id="sm" value={f.samity_id} onChange={set("samity_id")} disabled={editing}>
                {samities.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="nm">Full name</label>
              <input className="inp" id="nm" required maxLength={100} value={f.name} onChange={set("name")} />
            </div>
            <div>
              <label className="lbl" htmlFor="ph">Phone</label>
              <input className="inp" id="ph" required inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="01712345678" />
              <div className="hint">11-digit Bangladeshi mobile number</div>
            </div>
            <div>
              <label className="lbl" htmlFor="jd">Joined on</label>
              <input className="inp" id="jd" type="date" max={todayIso()} required value={f.joined_on} onChange={set("joined_on")} />
              <div className="hint">Cannot be in the future. Loans open after 6 months (Cl. 4.1).</div>
            </div>
            <div>
              <label className="lbl" htmlFor="us">Linked login user ID (optional)</label>
              <input className="inp" id="us" inputMode="numeric" value={f.user_id} onChange={set("user_id")} placeholder="e.g. 3" />
              <div className="hint">The member's account id, so they can see their own records.</div>
            </div>
          </div>
          <div>
            <span className="lbl">Status</span>
            <div className="seg" role="group" aria-label="Status">
              {(["active", "inactive"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={f.status === s} onClick={() => setF({ ...f, status: s })}>
                  {s === "active" ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </div>
          <div className="form-foot">
            <Link className="btn" to={editing ? `/members/${id}` : "/members"}>Cancel</Link>
            <button className="btn pri" type="submit" disabled={busy || !f.name.trim() || !f.phone.trim() || !f.member_no.trim()}>
              {busy ? "Saving…" : "Save member"}
            </button>
          </div>
        </form>

        {editing && (
          <div className="col-2 stack">
            <section className="card pad">
              <h2 style={{ marginBottom: 8 }}>Danger zone</h2>
              <p className="mut" style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55 }}>
                A member can be deleted only if they have no transactions. Otherwise set them to Inactive; the ledger is never edited.
              </p>
              <button className="btn danger-o" type="button" onClick={() => setConfirmDelete(true)}>
                Delete member
              </button>
            </section>
            {deleteError && <Alert>{deleteError}. Set the status to Inactive instead.</Alert>}
          </div>
        )}
      </div>

      {confirmDelete && original && (
        <Modal
          title={`Delete ${original.name}?`}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
              <button className="btn danger" type="button" onClick={doDelete}>Delete</button>
            </>
          }
        >
          <p>{original.member_no} will be removed permanently. This cannot be undone.</p>
        </Modal>
      )}
    </>
  );
}

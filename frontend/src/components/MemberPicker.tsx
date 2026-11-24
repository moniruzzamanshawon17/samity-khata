import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { initials, phone } from "../lib/format";
import type { Member } from "../lib/types";

export function MemberPicker({
  members,
  value,
  onChange,
  id = "member",
}: {
  members: Member[];
  value: Member | null;
  onChange: (m: Member | null) => void;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? members.filter((m) => m.name.toLowerCase().includes(s) || m.member_no.toLowerCase().includes(s) || m.phone.includes(s))
      : members;
    return list.slice(0, 6);
  }, [q, members]);

  if (value)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--control)", borderRadius: 10, padding: "10px 12px" }}>
        <span className="avatar" style={{ width: 40, height: 40, background: "#d7ebe1", color: "var(--ok)" }}>
          {initials(value.name)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{value.name}</div>
          <div className="mut" style={{ fontSize: 13 }}>
            {value.member_no} · {phone(value.phone)}
          </div>
        </div>
        <button type="button" className="quick" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );

  return (
    <div>
      <label className="search" style={{ maxWidth: "none", height: 44 }}>
        <Icon name="search" size={16} color="var(--muted)" />
        <span className="sr-only">Find member</span>
        <input id={id} autoFocus placeholder="Name, phone or member no." value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div role="listbox" aria-label="Matching members" style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => onChange(m)}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 12px", border: 0, borderBottom: "1px solid var(--line-2)", background: "#fff", cursor: "pointer", textAlign: "left", minHeight: 44 }}
          >
            <b style={{ fontSize: 13, minWidth: 76 }}>{m.member_no}</b>
            <span style={{ flex: 1 }}>{m.name}</span>
            <span className="mut" style={{ fontSize: 13 }}>{phone(m.phone)}</span>
          </button>
        ))}
        {matches.length === 0 && <div className="mut" style={{ padding: 12, fontSize: 14 }}>No member matches “{q}”.</div>}
      </div>
    </div>
  );
}

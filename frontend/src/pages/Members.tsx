import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Alert, Chip, Empty, Loading, PageHead, Pager } from "../components/ui";
import { api, fetchAll, mapLimit } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getBalance, loadSamities } from "../lib/data";
import { dateLabel, phone, taka } from "../lib/format";
import type { Loan, Member, Page } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const SIZE = 20;

export function Members() {
  const { is } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [draft, setDraft] = useState(q);

  // Debounce typing into the URL (which drives the request).
  useEffect(() => {
    const id = setTimeout(() => {
      if (draft !== q) update({ q: draft, page: "1" });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  }

  const samities = useAsync(loadSamities, []);
  const list = useAsync(async () => {
    const res = await api.get<Page<Member>>("/members", { q: q || undefined, status: status || undefined, page, size: SIZE });
    const [balances, loans] = await Promise.all([
      mapLimit(res.items, 8, (m) => getBalance(m.id)),
      fetchAll<Loan>("/loans").then((ls) => ls.filter((l) => l.status !== "closed")),
    ]);
    return { res, balances: new Map(balances.map((b) => [b.member_id, b])), loans: new Map(loans.map((l) => [l.member_id, l])) };
  }, [q, status, page]);

  const samityName = samities.data?.[0]?.name;

  return (
    <>
      <PageHead title="Members" bn="সদস্য" sub={`${list.data?.res.total ?? "…"} members${samityName ? ` · ${samityName}` : ""}`}>
        {is("admin") && (
          <Link className="btn pri" to="/members/new">
            + Add member
          </Link>
        )}
      </PageHead>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <label className="search">
          <Icon name="search" size={16} color="var(--muted)" />
          <span className="sr-only">Search members</span>
          <input placeholder="Search name, phone or member no." value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <label className="flt" style={{ flexDirection: "row", alignItems: "center", gap: 8, fontSize: 14 }}>
          Status
          <select className="inp" style={{ height: 40, width: "auto" }} value={status} onChange={(e) => update({ status: e.target.value, page: "1" })}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        {(q || status) && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              setDraft("");
              setParams({}, { replace: true });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <section className="card">
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <div className="pad">
            <Alert>{list.error}</Alert>
          </div>
        ) : list.data && list.data.res.items.length === 0 ? (
          <Empty title={q ? `No members match “${q}”` : "No members yet"}>
            {q ? "Check the spelling or search by phone number." : is("admin") ? "Add the first member to get started." : null}
          </Empty>
        ) : (
          list.data && (
            <>
              <div className="tbl-wrap" style={{ opacity: list.loading ? 0.6 : 1 }}>
                <table className="t resp">
                  <thead>
                    <tr>
                      <th>Member no.</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Joined</th>
                      <th className="num">Savings</th>
                      <th>Deposits</th>
                      <th>Loan</th>
                      <th>Status</th>
                      {is("admin") && <th><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.res.items.map((m) => {
                      const b = list.data!.balances.get(m.id);
                      const loan = list.data!.loans.get(m.id);
                      const unpaid = b?.unpaid_deposits ?? 0;
                      const inactive = b?.bylaw_status === "inactive" || m.status === "inactive";
                      return (
                        <tr key={m.id}>
                          <td data-label="Member no." style={{ fontWeight: 600 }}>{m.member_no}</td>
                          <td className="lead">
                            <span>
                              <Link className="strong" to={`/members/${m.id}`}>
                                {m.name}
                              </Link>
                              <span className="mut" style={{ fontSize: 12, display: "block" }}>
                                {m.user_id ? `linked login #${m.user_id}` : "no login"}
                              </span>
                            </span>
                          </td>
                          <td data-label="Phone">{phone(m.phone)}</td>
                          <td data-label="Joined">{dateLabel(m.joined_on)}</td>
                          <td data-label="Savings" className="num">{b ? taka(b.savings_balance_paisa, { decimals: false }) : "—"}</td>
                          <td data-label="Deposits">
                            <Chip kind={unpaid === 0 ? "ok" : unpaid >= 3 ? "bad" : "warn"}>{unpaid === 0 ? "Up to date" : `${unpaid} unpaid`}</Chip>
                          </td>
                          <td data-label="Loan">
                            {loan ? (
                              <Link to={`/loans/${loan.id}`} style={{ textDecoration: "none" }}>
                                <Chip kind={loan.status === "overdue" ? "bad" : "neu"}>
                                  {loan.status === "overdue" ? "Overdue" : "Active"} · {taka(loan.principal_outstanding_paisa, { decimals: false })}
                                </Chip>
                              </Link>
                            ) : (
                              <span className="mut">—</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <Chip kind={inactive ? "warn" : "ok"}>{inactive ? "Inactive" : "Active"}</Chip>
                          </td>
                          {is("admin") && (
                            <td className="nolabel">
                              <Link to={`/members/${m.id}/edit`} style={{ fontSize: 14 }}>
                                Edit
                              </Link>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} size={SIZE} total={list.data.res.total} onPage={(p) => update({ page: String(p) })} />
            </>
          )
        )}
      </section>

      <div className="card pad" style={{ marginTop: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Chip kind="warn">Inactive</Chip>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          A member counts as <b>inactive</b> at 3 unpaid monthly deposits (Clause 2.4). Inactive members cannot take a loan.
        </p>
      </div>
    </>
  );
}

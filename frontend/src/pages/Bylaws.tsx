import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Alert, Bar, Chip, Loading, PageHead } from "../components/ui";
import { api, errorText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { loadSamities } from "../lib/data";
import { dateLabel } from "../lib/format";
import type { BylawDocument, BylawSearchResult, IngestResult } from "../lib/types";
import { useAsync } from "../lib/useAsync";

/** Chunks start with their #### heading, e.g. "3.2 Late deposit fine". */
function splitHeading(text: string): { head: string; body: string } {
  const lines = text.trim().split("\n");
  const first = lines[0].replace(/^#+\s*/, "");
  if (lines.length > 1 && first.length < 90) return { head: first, body: lines.slice(1).join("\n").trim() };
  return { head: "", body: text.trim() };
}

export function Bylaws() {
  const { is } = useAuth();
  const docs = useAsync(() => api.get<BylawDocument[]>("/bylaws"), []);
  const samities = useAsync(loadSamities, []);
  const [q, setQ] = useState("দেরিতে জমা দিলে জরিমানা কত?");
  const [result, setResult] = useState<BylawSearchResult | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<{ ok?: IngestResult; err?: string } | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setSearchErr(null);
    try {
      setResult(await api.get<BylawSearchResult>("/bylaws/search", { q: q.trim(), limit: 5 }));
    } catch (err) {
      setSearchErr(errorText(err));
      setResult(null);
    } finally {
      setSearching(false);
    }
  }

  async function ingest(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUpload(null);
    const form = new FormData();
    form.append("file", file);
    if (title.trim()) form.append("title", title.trim());
    const samityId = samities.data?.[0]?.id;
    if (link && samityId) form.append("samity_id", String(samityId));
    try {
      const res = await api.upload<IngestResult>("/bylaws/ingest", form);
      setUpload({ ok: res });
      setFile(null);
      setTitle("");
      docs.reload();
    } catch (err) {
      setUpload({ err: errorText(err) });
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  const linkedId = samities.data?.[0]?.bylaw_document_id;

  return (
    <>
      <PageHead
        title="Bylaws"
        bn="উপবিধি"
        sub="The assistant answers rule questions only from these clauses. Each clause is one searchable chunk; English and Bangla share clause numbers."
      />
      <div className="row">
        <section className="card pad col-3">
          <h2 style={{ marginBottom: 12 }}>Search the bylaws</h2>
          <form onSubmit={search} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 280px" }}>
              <span className="sr-only">Question</span>
              <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a rule question in Bangla or English" maxLength={500} />
            </label>
            <button className="btn pri lg" type="submit" disabled={searching || q.trim().length < 2}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          {searchErr && <div style={{ marginTop: 14 }}><Alert>{searchErr}</Alert></div>}
          {result && (
            <>
              <div className="mut" style={{ fontSize: 13, margin: "10px 0 16px" }}>
                {result.hits.length} clause{result.hits.length === 1 ? "" : "s"} above the similarity threshold ({result.threshold}) · searched English + Bangla
              </div>
              {result.hits.length === 0 ? (
                <Alert kind="neu">The bylaws do not cover this. Please ask the samity secretary (Clause 7.7).</Alert>
              ) : (
                <div className="stack" style={{ gap: 12 }}>
                  {result.hits.map((h) => {
                    const { head, body } = splitHeading(h.chunk_text);
                    const bn = h.source_language === "bn";
                    return (
                      <article className="hit" key={`${h.document_id}-${h.position}`}>
                        <div className="hit-top">
                          <b className={bn ? "bn" : undefined}>{head || h.document_title}</b>
                          <Chip kind={bn ? "blu" : "neu"}>{bn ? "বাংলা" : "English"}</Chip>
                          <span className="score">
                            <Bar small pct={h.similarity * 100} />
                            {h.similarity.toFixed(2)}
                          </span>
                        </div>
                        <p className={bn ? "bn" : undefined} style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{body}</p>
                        <div className="mut" style={{ fontSize: 12 }}>{h.document_title}</div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <div className="col-2 stack">
          {is("admin") && (
            <form className="card pad" onSubmit={ingest}>
              <h2 style={{ marginBottom: 12 }}>Upload a bylaw</h2>
              <div
                className={`drop${over ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <Icon name="upload" size={28} color="var(--primary)" />
                <div style={{ fontWeight: 600 }}>{file ? file.name : "Drop a PDF or Markdown file"}</div>
                <div className="mut" style={{ fontSize: 13 }}>{file ? `${(file.size / 1024).toFixed(0)} KB` : "Text-based PDF or .md, up to 10 MB"}</div>
                <button type="button" className="btn" onClick={() => inputRef.current?.click()}>Choose file</button>
                <input ref={inputRef} type="file" accept=".pdf,.md,application/pdf,text/markdown" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="stack" style={{ gap: 14, marginTop: 16 }}>
                <div>
                  <label className="lbl" htmlFor="tt">Title</label>
                  <input className="inp" id="tt" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file’s # heading" />
                  <div className="hint">Re-using a title replaces that document's clauses.</div>
                </div>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, minHeight: 44 }}>
                  <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--primary)" }} />
                  Link to {samities.data?.[0]?.name ?? "the samity"}
                </label>
                <button className="btn pri" type="submit" disabled={!file || uploading}>
                  {uploading ? "Chunking & embedding…" : "Upload and ingest"}
                </button>
                {upload?.err && <Alert>{upload.err}</Alert>}
                {upload?.ok && (
                  <Alert kind="ok">
                    <b>{upload.ok.title}</b> · {upload.ok.chunk_count} clauses
                    {Object.keys(upload.ok.languages).length ? ` (${Object.entries(upload.ok.languages).map(([l, n]) => `${l}: ${n}`).join(", ")})` : ""}
                    {upload.ok.replaced ? " · replaced the earlier upload" : ""}
                  </Alert>
                )}
              </div>
            </form>
          )}
          <section className="card" style={{ padding: "8px 20px" }}>
            {docs.loading ? (
              <Loading />
            ) : docs.error ? (
              <div style={{ padding: "12px 0" }}><Alert>{docs.error}</Alert></div>
            ) : docs.data?.length ? (
              docs.data.map((d) => (
                <div className="doc" key={d.id}>
                  <div className="doc-ic">{d.filename.toLowerCase().endsWith(".pdf") ? "PDF" : "MD"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }} className="bn">{d.title}</div>
                    <div className="mut" style={{ fontSize: 13 }}>
                      {d.filename} · {d.chunk_count} clauses · {dateLabel(d.created_at)}
                    </div>
                  </div>
                  {d.id === linkedId ? <Chip kind="ok">Samity bylaw</Chip> : d.samity_id ? <Chip kind="neu">Linked</Chip> : null}
                </div>
              ))
            ) : (
              <div className="empty"><b>No bylaws yet</b>Upload the samity's bylaw so the assistant can answer rule questions.</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

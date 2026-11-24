import type { ReactNode } from "react";

// The model answers in light Markdown (**bold**, * bullets, 1. lists).
// Render just that subset as React elements — never as raw HTML.

function inline(input: string, key: string): ReactNode[] {
  // While an answer streams in, a **bold run may not be closed yet: close it so no raw ** shows.
  const text = (input.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? `${input}**` : input;
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={`${key}b${i++}`}>{m[1]}</strong> : <code key={`${key}c${i++}`}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} style={{ margin: "0 0 8px" }}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
    const style = { margin: "0 0 8px", paddingLeft: 20 };
    blocks.push(list.ordered ? <ol key={`o${blocks.length}`} style={style}>{items}</ol> : <ul key={`u${blocks.length}`} style={style}>{items}</ul>);
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[*-]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#+\s*/, ""));
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}

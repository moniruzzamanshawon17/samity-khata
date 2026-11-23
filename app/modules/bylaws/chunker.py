"""Split a bylaw markdown file into one chunk per clause, for the bylaw_chunks table.

Each "#### " heading starts a clause. The chunk keeps its heading, so the chat
answer can show a source label such as "Clause 3.2". English and Bangla
clauses share the same ASCII clause id, so both languages point to one rule.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

HEADING = re.compile(r"^#### (.+)$", re.MULTILINE)
CLAUSE_ID = re.compile(r"[0-9]+\.[0-9]+")  # ASCII digits only, so Bangla headings match on "(3.2)"


@dataclass(frozen=True)
class ClauseChunk:
    clause: str          # "3.2"
    title: str           # heading text without "#### "
    text: str            # heading + body, the text that gets embedded
    position: int        # order in the document, from 0
    source_language: str  # "en" or "bn"
    document_title: str


def chunk_bylaw(markdown: str, source_language: str, document_title: str) -> list[ClauseChunk]:
    headings = list(HEADING.finditer(markdown))
    chunks: list[ClauseChunk] = []
    for position, match in enumerate(headings):
        end = headings[position + 1].start() if position + 1 < len(headings) else len(markdown)
        title = match.group(1).strip()
        body = markdown[match.end():end].strip()
        clause_match = CLAUSE_ID.search(title)
        if clause_match is None:
            raise ValueError(f"heading has no clause number: {title!r}")
        chunks.append(
            ClauseChunk(
                clause=clause_match.group(0),
                title=title,
                text=f"{title}\n{body}",
                position=position,
                source_language=source_language,
                document_title=document_title,
            )
        )
    return chunks


def chunk_file(path: str | Path, source_language: str) -> list[ClauseChunk]:
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    first_line = text.splitlines()[0].lstrip("# ").strip() if text else path.stem
    return chunk_bylaw(text, source_language, first_line)

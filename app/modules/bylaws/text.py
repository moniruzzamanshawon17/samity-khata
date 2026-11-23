"""Turning an uploaded bylaw (PDF or Markdown) into text chunks."""

import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Sentence ends in English (. ! ?) and Bangla (the dari, "।").
_SENTENCE_END = re.compile(r"(?<=[.!?।])\s+")
_BANGLA = re.compile(r"[\u0980-\u09FF]")
_LATIN = re.compile(r"[A-Za-z]")


class UnreadablePdf(ValueError):
    """The file isn't a PDF or Markdown file we can read text from."""


SUPPORTED_SUFFIXES = (".pdf", ".md")
_MARKDOWN_TITLE = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def extract_markdown_text(data: bytes) -> str:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise UnreadablePdf("Markdown files must be UTF-8 text") from exc
    if not text.strip():
        raise UnreadablePdf("The file is empty")
    return text


def markdown_title(text: str) -> str | None:
    """The first '# ' heading, used as the default document title."""
    match = _MARKDOWN_TITLE.search(text)
    return match.group(1).strip() if match else None


def extract_pdf_text(data: bytes) -> str:
    if not data.startswith(b"%PDF-"):
        raise UnreadablePdf("The file is not a PDF")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise UnreadablePdf("Password-protected PDFs are not supported")
        pages = [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as exc:
        raise UnreadablePdf("The PDF could not be read") from exc

    text = "\n\n".join(pages)
    if not text.strip():
        raise UnreadablePdf(
            "No text found in the PDF; scanned documents need OCR before upload"
        )
    return text


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _sentences(text: str) -> list[str]:
    sentences: list[str] = []
    for paragraph in text.split("\n\n"):
        paragraph = paragraph.replace("\n", " ").strip()
        if not paragraph:
            continue
        for sentence in _SENTENCE_END.split(paragraph):
            sentence = sentence.strip()
            # A single sentence longer than a chunk is cut at word boundaries.
            while len(sentence) > CHUNK_SIZE:
                cut = sentence.rfind(" ", 0, CHUNK_SIZE)
                cut = cut if cut > 0 else CHUNK_SIZE
                sentences.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
            if sentence:
                sentences.append(sentence)
    return sentences


def chunk_text(text: str) -> list[str]:
    """Split text into chunks of up to CHUNK_SIZE characters, cut at sentence
    ends, with about CHUNK_OVERLAP characters repeated between neighbours so a
    rule that spans a boundary is still found whole in one chunk."""
    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for sentence in _sentences(_normalise(text)):
        if current and length + 1 + len(sentence) > CHUNK_SIZE:
            chunks.append(" ".join(current))
            # Carry the last sentences over as overlap.
            overlap: list[str] = []
            overlap_len = 0
            for previous in reversed(current):
                if overlap_len + len(previous) > CHUNK_OVERLAP:
                    break
                overlap.insert(0, previous)
                overlap_len += len(previous) + 1
            current, length = overlap, max(overlap_len - 1, 0)
        current.append(sentence)
        length += len(sentence) + (1 if length else 0)

    if current:
        chunks.append(" ".join(current))
    return chunks


def detect_language(text: str) -> str:
    """'bn' if the text is mostly Bangla script, otherwise 'en'."""
    bangla = len(_BANGLA.findall(text))
    latin = len(_LATIN.findall(text))
    return "bn" if bangla > latin else "en"
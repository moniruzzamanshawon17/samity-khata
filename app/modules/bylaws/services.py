from collections import Counter
from pathlib import PurePath

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableError,
)
from app.integrations.embeddings import EmbeddingClient, EmbeddingError
from app.modules.bylaws.chunker import chunk_bylaw
from app.modules.bylaws.models import BylawChunk, BylawDocument
from app.modules.bylaws.repositories import BylawRepository
from app.modules.bylaws.schemas import (
    BylawDocumentRead,
    BylawSearchHit,
    BylawSearchResult,
    IngestResult,
)
from app.modules.bylaws.text import (
    SUPPORTED_SUFFIXES,
    UnreadablePdf,
    chunk_text,
    detect_language,
    extract_markdown_text,
    extract_pdf_text,
    markdown_title,
)
from app.modules.samities.repositories import SamityRepository

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_CHUNKS = 2000


class BylawService:
    def __init__(
        self,
        session: AsyncSession,
        repo: BylawRepository,
        samities: SamityRepository,
        embedder: EmbeddingClient,
    ) -> None:
        self.session = session
        self.repo = repo
        self.samities = samities
        self.embedder = embedder

    async def ingest(
        self,
        *,
        data: bytes,
        filename: str,
        title: str | None,
        samity_id: int | None,
        uploaded_by: int | None,
    ) -> IngestResult:
        if len(data) > MAX_FILE_BYTES:
            raise UnprocessableError("The file is larger than 10 MB")
        if samity_id is not None and await self.samities.get(samity_id) is None:
            raise NotFoundError("Samity not found")

        texts, detected_title = self._read(data, filename)
        title = (title or detected_title or PurePath(filename).stem).strip()[:200] or "Untitled"
        if not texts:
            raise UnprocessableError("No text found in the file")
        if len(texts) > MAX_CHUNKS:
            raise UnprocessableError(
                f"The document is too long (over {MAX_CHUNKS} chunks)"
            )

        # Embed before touching the database, so no rows are locked while waiting.
        vectors = await self._embed(texts)
        languages = [detect_language(t) for t in texts]

        try:
            document, replaced = await self._store(
                title, filename, uploaded_by, texts, vectors, languages
            )
            if samity_id is not None:
                document.samity_id = samity_id
                samity = await self.samities.get(samity_id)
                samity.bylaw_document_id = document.id
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise ConflictError(
                "Another upload with this title is in progress"
            ) from None
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(document)

        return IngestResult(
            **BylawDocumentRead.model_validate(document).model_dump(),
            replaced=replaced,
            languages=dict(Counter(languages)),
        )

    async def list_documents(self) -> list[BylawDocument]:
        return list(await self.repo.list_documents())

    async def search(
        self, query: str, *, limit: int = 5, samity_id: int | None = None
    ) -> BylawSearchResult:
        """Find the bylaw passages that best answer a question. Used by the
        search endpoint and, later, by the chat assistant's tool."""
        threshold = get_settings().RAG_SIMILARITY_THRESHOLD
        document_ids = None
        if samity_id is not None:
            samity = await self.samities.get(samity_id)
            if samity is None:
                raise NotFoundError("Samity not found")
            document_ids = await self.repo.document_ids_for_samity(samity)
            if not document_ids:
                return BylawSearchResult(query=query, threshold=threshold, hits=[])

        query_vector = await self._embed_query(query)
        rows = await self.repo.search(
            query_vector, threshold=threshold, limit=limit, document_ids=document_ids
        )
        return BylawSearchResult(
            query=query,
            threshold=threshold,
            hits=[
                BylawSearchHit(
                    document_id=chunk.document_id,
                    document_title=chunk.document_title,
                    position=chunk.position,
                    chunk_text=chunk.chunk_text,
                    source_language=chunk.source_language,
                    similarity=round(similarity, 4),
                )
                for chunk, similarity in rows
            ],
        )

    @staticmethod
    def _read(data: bytes, filename: str) -> tuple[list[str], str | None]:
        """Chunks and a suggested title. Markdown bylaws with '#### Clause' headings
        are split one clause per chunk; anything else by length."""
        suffix = PurePath(filename).suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise UnprocessableError("Unsupported file type: upload a PDF or Markdown (.md) file")
        try:
            if suffix == ".pdf":
                return chunk_text(extract_pdf_text(data)), None
            text = extract_markdown_text(data)
            title = markdown_title(text)
            if "\n#### " in f"\n{text}":
                clauses = chunk_bylaw(text, detect_language(text), title or filename)
                return [clause.text for clause in clauses], title
            return chunk_text(text), title
        except UnreadablePdf as exc:
            raise UnprocessableError(str(exc)) from None
        except ValueError as exc:  # a clause heading without a number
            raise UnprocessableError(str(exc)) from None

    async def _store(
        self,
        title: str,
        filename: str,
        uploaded_by: int | None,
        texts: list[str],
        vectors: list[list[float]],
        languages: list[str],
    ) -> tuple[BylawDocument, bool]:
        """Create the document, or replace an existing one's chunks. Not committed."""
        document = await self.repo.get_by_title_for_update(title)
        replaced = document is not None
        if document is None:
            document = BylawDocument(
                title=title, filename=filename, uploaded_by=uploaded_by, chunk_count=0
            )
            self.session.add(document)
            await self.session.flush()
        else:
            await self.repo.delete_chunks(document.id)
            document.filename = filename
            document.uploaded_by = uploaded_by

        document.chunk_count = len(texts)
        self.session.add_all(
            BylawChunk(
                document_id=document.id,
                document_title=title,
                position=position,
                chunk_text=text,
                embedding=vector,
                source_language=language,
            )
            for position, (text, vector, language) in enumerate(
                zip(texts, vectors, languages)
            )
        )
        await self.session.flush()
        return document, replaced

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        try:
            return await self.embedder.embed_passages(texts)
        except EmbeddingError as exc:
            raise ServiceUnavailableError(str(exc)) from None

    async def _embed_query(self, text: str) -> list[float]:
        try:
            return await self.embedder.embed_query(text)
        except EmbeddingError as exc:
            raise ServiceUnavailableError(str(exc)) from None
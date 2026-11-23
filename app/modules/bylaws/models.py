from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, TimeSpent

EMBEDDING_DIM = get_settings().EMBEDDING_DIM


class BylawDocument(TimeSpent, Base):
    """One uploaded bylaw file. Re-uploading the same title replaces its chunks.

    A samity can have several documents, e.g. its bylaw in English and in Bangla.
    """

    __tablename__ = "bylaw_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    chunk_count: Mapped[int] = mapped_column(Integer)
    samity_id: Mapped[int | None] = mapped_column(
        ForeignKey("samities.id", ondelete="SET NULL"), index=True
    )
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class BylawChunk(Base):
    __tablename__ = "bylaw_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "position", name="uq_bylaw_chunks_document_position"),
        Index(
            "ix_bylaw_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("bylaw_documents.id", ondelete="CASCADE")
    )
    document_title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    source_language: Mapped[str] = mapped_column(String(5))

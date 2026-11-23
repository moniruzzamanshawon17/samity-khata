from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BylawDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    filename: str
    chunk_count: int
    samity_id: int | None
    uploaded_by: int | None
    created_at: datetime
    updated_at: datetime


class IngestResult(BylawDocumentRead):
    replaced: bool = Field(description="True if an earlier upload with this title was replaced")
    languages: dict[str, int] = Field(description="Number of chunks per detected language")


class BylawSearchHit(BaseModel):
    document_id: int
    document_title: str
    position: int
    chunk_text: str
    source_language: str
    similarity: float = Field(description="Cosine similarity, 0 to 1; higher is closer")


class BylawSearchResult(BaseModel):
    query: str
    threshold: float
    hits: list[BylawSearchHit]
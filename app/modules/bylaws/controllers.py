from pathlib import PurePath
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.db.session import SessionDep
from app.integrations.embeddings import EmbeddingClient, get_embedding_client
from app.modules.auth.dependencies import AdminUser, CurrentUser
from app.modules.bylaws.models import BylawDocument
from app.modules.bylaws.repositories import BylawRepository
from app.modules.bylaws.schemas import (
    BylawDocumentRead,
    BylawSearchResult,
    IngestResult,
)
from app.modules.bylaws.services import BylawService
from app.modules.samities.repositories import SamityRepository

router = APIRouter(prefix="/bylaws", tags=["bylaws"])


def get_bylaw_service(
    session: SessionDep,
    embedder: Annotated[EmbeddingClient, Depends(get_embedding_client)],
) -> BylawService:
    return BylawService(session, BylawRepository(session), SamityRepository(session), embedder)


BylawServiceDep = Annotated[BylawService, Depends(get_bylaw_service)]


@router.post(
    "/ingest",
    response_model=IngestResult,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Samity not found"},
        422: {"description": "Unsupported file: not a readable PDF or Markdown file"},
        503: {"description": "Embedding service unavailable"},
    },
)
async def ingest_bylaw(
    user: AdminUser,
    service: BylawServiceDep,
    file: UploadFile = File(..., description="A text-based PDF or a Markdown (.md) bylaw, up to 10 MB"),
    title: str | None = Form(
        None,
        max_length=200,
        description="Defaults to the Markdown '# ' title or the file name. Re-using a title replaces that document.",
    ),
    samity_id: int | None = Form(None, gt=0, description="Link this document as the samity's bylaws"),
) -> IngestResult:
    filename = PurePath(file.filename or "upload.pdf").name
    data = await file.read()
    return await service.ingest(
        data=data,
        filename=filename,
        title=title,
        samity_id=samity_id,
        uploaded_by=user.id,
    )


@router.get("", response_model=list[BylawDocumentRead])
async def list_bylaw_documents(_: CurrentUser, service: BylawServiceDep) -> list[BylawDocument]:
    return await service.list_documents()


@router.get(
    "/search",
    response_model=BylawSearchResult,
    responses={503: {"description": "Embedding service unavailable"}},
)
async def search_bylaws(
    _: CurrentUser,
    service: BylawServiceDep,
    q: str = Query(..., min_length=2, max_length=500, description="A question, in Bangla or English"),
    samity_id: int | None = Query(None, gt=0, description="Only search this samity's bylaws"),
    limit: int = Query(5, ge=1, le=20),
) -> BylawSearchResult:
    return await service.search(q, limit=limit, samity_id=samity_id)

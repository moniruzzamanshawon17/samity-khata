from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bylaws.models import BylawChunk, BylawDocument
from app.modules.samities.models import Samity


class BylawRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_title_for_update(self, title: str) -> BylawDocument | None:
        result = await self.session.execute(
            select(BylawDocument).where(BylawDocument.title == title).with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_documents(self) -> Sequence[BylawDocument]:
        result = await self.session.execute(select(BylawDocument).order_by(BylawDocument.id))
        return result.scalars().all()

    async def document_ids_for_samity(self, samity: Samity) -> list[int]:
        """All documents of a samity (e.g. English and Bangla), plus the one its
        bylaw_document_id points at."""
        result = await self.session.execute(
            select(BylawDocument.id).where(BylawDocument.samity_id == samity.id)
        )
        ids = set(result.scalars().all())
        if samity.bylaw_document_id is not None:
            ids.add(samity.bylaw_document_id)
        return sorted(ids)

    async def delete_chunks(self, document_id: int) -> None:
        await self.session.execute(delete(BylawChunk).where(BylawChunk.document_id == document_id))

    async def search(
        self,
        query_vector: list[float],
        *,
        threshold: float,
        limit: int,
        document_ids: list[int] | None = None,
    ) -> list[tuple[BylawChunk, float]]:
        """Chunks closest to the query by cosine similarity, best first."""
        distance = BylawChunk.embedding.cosine_distance(query_vector)
        stmt = select(BylawChunk, (1 - distance).label("similarity")).where(
            distance <= 1 - threshold
        )
        if document_ids is not None:
            stmt = stmt.where(BylawChunk.document_id.in_(document_ids))
        result = await self.session.execute(stmt.order_by(distance).limit(limit))
        return [(chunk, float(similarity)) for chunk, similarity in result.all()]

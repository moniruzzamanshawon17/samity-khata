from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.samities.models import Samity


class SamityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, samity_id: int) -> Samity | None:
        return await self.session.get(Samity, samity_id)

    async def get_by_name(self, name: str) -> Samity | None:
        result = await self.session.execute(select(Samity).where(Samity.name == name))
        return result.scalar_one_or_none()

    async def list(self, offset: int, limit: int) -> tuple[Sequence[Samity], int]:
        total = await self.session.scalar(select(func.count()).select_from(Samity))
        result = await self.session.execute(
            select(Samity).order_by(Samity.id).offset(offset).limit(limit)
        )
        return result.scalars().all(), total or 0

    async def save(self, samity: Samity) -> Samity:
        """Raises IntegrityError if a constraint is violated."""
        self.session.add(samity)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(samity)
        return samity
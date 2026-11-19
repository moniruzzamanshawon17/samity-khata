from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, skip: int, limit: int) -> Sequence[User]:
        result = await self.session.execute(
            select(User).order_by(User.id).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def get(self, user_id: int) -> User | None:
        return await self.session.get(User, user_id)
from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.members.models import Member, MemberStatus


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, member_id: int) -> Member | None:
        return await self.session.get(Member, member_id)

    async def get_by_member_no(self, samity_id: int, member_no: str) -> Member | None:
        result = await self.session.execute(
            select(Member).where(Member.samity_id == samity_id, Member.member_no == member_no)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        samity_id: int | None,
        status: MemberStatus | None,
        q: str | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Member], int]:
        conditions = []
        if samity_id is not None:
            conditions.append(Member.samity_id == samity_id)
        if status is not None:
            conditions.append(Member.status == status)
        if q:
            conditions.append(
                or_(
                    Member.name.icontains(q, autoescape=True),
                    Member.phone.contains(q, autoescape=True),
                    Member.member_no.icontains(q, autoescape=True),
                )
            )

        total = await self.session.scalar(
            select(func.count()).select_from(Member).where(*conditions)
        )
        result = await self.session.execute(
            select(Member).where(*conditions).order_by(Member.id).offset(offset).limit(limit)
        )
        return result.scalars().all(), total or 0

    async def save(self, member: Member) -> Member:
        """Raises IntegrityError if a constraint is violated."""
        self.session.add(member)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(member)
        return member

    async def delete(self, member: Member) -> None:
        """Raises IntegrityError if other rows (e.g. transactions) still reference it."""
        await self.session.delete(member)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
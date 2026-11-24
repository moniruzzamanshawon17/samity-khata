from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.schemas import Page
from app.modules.auth.models import UserRole
from app.modules.auth.repositories import UserRepository
from app.modules.members.models import Member, MemberStatus
from app.modules.members.repositories import MemberRepository
from app.modules.members.schemas import MemberCreate, MemberRead, MemberUpdate
from app.modules.samities.repositories import SamityRepository

MEMBER_NOT_FOUND = "Member not found"
MEMBER_NO_TAKEN = "This member number is already used in this samity"
HAS_RECORDS = (
    "Member has transactions or loans and cannot be deleted; set status to inactive instead"
)


class MemberService:
    def __init__(
        self,
        repo: MemberRepository,
        samities: SamityRepository,
        users: UserRepository,
    ) -> None:
        self.repo = repo
        self.samities = samities
        self.users = users

    async def get(self, member_id: int) -> Member:
        member = await self.repo.get(member_id)
        if member is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, MEMBER_NOT_FOUND)
        return member

    async def list(
        self,
        *,
        samity_id: int | None,
        member_status: MemberStatus | None,
        q: str | None,
        page: int,
        size: int,
    ) -> Page[MemberRead]:
        items, total = await self.repo.list(
            samity_id=samity_id,
            status=member_status,
            q=q,
            offset=(page - 1) * size,
            limit=size,
        )
        return Page(
            items=[MemberRead.model_validate(m) for m in items],
            total=total,
            page=page,
            size=size,
        )

    async def create(self, data: MemberCreate) -> Member:
        if await self.samities.get(data.samity_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Samity not found")
        if data.user_id is not None:
            await self._check_linkable_user(data.user_id)
        if await self.repo.get_by_member_no(data.samity_id, data.member_no) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, MEMBER_NO_TAKEN)

        return await self._save(Member(**data.model_dump()))

    async def update(self, member_id: int, data: MemberUpdate) -> Member:
        member = await self.get(member_id)
        changes = data.model_dump(exclude_unset=True)

        new_no = changes.get("member_no")
        if new_no and new_no != member.member_no:
            if await self.repo.get_by_member_no(member.samity_id, new_no) is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, MEMBER_NO_TAKEN)
        if changes.get("user_id") is not None:
            await self._check_linkable_user(changes["user_id"])

        for field, value in changes.items():
            setattr(member, field, value)
        return await self._save(member)

    async def delete(self, member_id: int) -> None:
        member = await self.get(member_id)
        try:
            await self.repo.delete(member)
        except IntegrityError:
            # Transactions and loans reference members with ON DELETE RESTRICT.
            raise HTTPException(status.HTTP_409_CONFLICT, HAS_RECORDS) from None

    async def _check_linkable_user(self, user_id: int) -> None:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        if user.role != UserRole.CUSTOMER:
            raise HTTPException(
                422,
                "Only customer accounts can be linked to a member",
            )

    async def _save(self, member: Member) -> Member:
        try:
            return await self.repo.save(member)
        except IntegrityError:
            # Another request took the same member number at the same moment.
            raise HTTPException(status.HTTP_409_CONFLICT, MEMBER_NO_TAKEN) from None
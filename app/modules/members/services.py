from collections.abc import Sequence

from fastapi import HTTPException, status

from app.modules.auth.models import User
from app.modules.members.repositories import MemberRepository


class MemberService:
    def __init__(self, repo: MemberRepository) -> None:
        self.repo = repo

    async def list_members(self, skip: int, limit: int) -> Sequence[User]:
        return await self.repo.list(skip, limit)

    async def get_member(self, user_id: int) -> User:
        user = await self.repo.get(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
        return user
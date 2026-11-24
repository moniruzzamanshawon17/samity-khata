from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.schemas import Page
from app.modules.samities.models import Samity
from app.modules.samities.repositories import SamityRepository
from app.modules.samities.schemas import SamityCreate, SamityRead, SamityUpdate

SAMITY_NOT_FOUND = "Samity not found"
NAME_TAKEN = "A samity with this name already exists"


class SamityService:
    def __init__(self, repo: SamityRepository) -> None:
        self.repo = repo

    async def get(self, samity_id: int) -> Samity:
        samity = await self.repo.get(samity_id)
        if samity is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, SAMITY_NOT_FOUND)
        return samity

    async def list(self, page: int, size: int) -> Page[SamityRead]:
        items, total = await self.repo.list(offset=(page - 1) * size, limit=size)
        return Page(
            items=[SamityRead.model_validate(s) for s in items],
            total=total,
            page=page,
            size=size,
        )

    async def create(self, data: SamityCreate) -> Samity:
        if await self.repo.get_by_name(data.name) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN)
        return await self._save(Samity(**data.model_dump()))

    async def update(self, samity_id: int, data: SamityUpdate) -> Samity:
        samity = await self.get(samity_id)
        changes = data.model_dump(exclude_unset=True)

        new_name = changes.get("name")
        if new_name and new_name != samity.name:
            if await self.repo.get_by_name(new_name) is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN)

        for field, value in changes.items():
            setattr(samity, field, value)
        return await self._save(samity)

    async def _save(self, samity: Samity) -> Samity:
        try:
            return await self.repo.save(samity)
        except IntegrityError:
            raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN) from None
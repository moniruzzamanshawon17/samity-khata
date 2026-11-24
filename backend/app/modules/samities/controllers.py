from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.schemas import Page
from app.db.session import SessionDep
from app.modules.auth.dependencies import AdminUser, StaffUser
from app.modules.samities.models import Samity
from app.modules.samities.repositories import SamityRepository
from app.modules.samities.schemas import SamityCreate, SamityRead, SamityUpdate
from app.modules.samities.services import SamityService

router = APIRouter(prefix="/samities", tags=["samities"])


def get_samity_service(session: SessionDep) -> SamityService:
    return SamityService(SamityRepository(session))


SamityServiceDep = Annotated[SamityService, Depends(get_samity_service)]


@router.get("", response_model=Page[SamityRead])
async def list_samities(
    _: StaffUser,
    service: SamityServiceDep,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> Page[SamityRead]:
    return await service.list(page, size)


@router.get(
    "/{samity_id}",
    response_model=SamityRead,
    responses={404: {"description": "Samity not found"}},
)
async def get_samity(samity_id: int, _: StaffUser, service: SamityServiceDep) -> Samity:
    return await service.get(samity_id)


@router.post(
    "",
    response_model=SamityRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "A samity with this name already exists"}},
)
async def create_samity(
    data: SamityCreate, _: AdminUser, service: SamityServiceDep
) -> Samity:
    return await service.create(data)


@router.patch(
    "/{samity_id}",
    response_model=SamityRead,
    responses={404: {"description": "Samity not found"}, 409: {"description": "Name taken"}},
)
async def update_samity(
    samity_id: int, data: SamityUpdate, _: AdminUser, service: SamityServiceDep
) -> Samity:
    return await service.update(samity_id, data)
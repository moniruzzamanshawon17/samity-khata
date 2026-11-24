from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.schemas import Page
from app.db.session import SessionDep
from app.modules.auth.dependencies import AdminUser, StaffUser
from app.modules.auth.repositories import UserRepository
from app.modules.members.dependencies import AccessibleMember
from app.modules.members.models import Member, MemberStatus
from app.modules.members.repositories import MemberRepository
from app.modules.members.schemas import MemberCreate, MemberRead, MemberUpdate
from app.modules.members.services import MemberService
from app.modules.samities.repositories import SamityRepository

router = APIRouter(prefix="/members", tags=["members"])


def get_member_service(session: SessionDep) -> MemberService:
    return MemberService(
        MemberRepository(session), SamityRepository(session), UserRepository(session)
    )


MemberServiceDep = Annotated[MemberService, Depends(get_member_service)]


@router.get("", response_model=Page[MemberRead])
async def list_members(
    _: StaffUser,
    service: MemberServiceDep,
    samity_id: int | None = Query(None, gt=0),
    member_status: MemberStatus | None = Query(None, alias="status"),
    q: str | None = Query(None, min_length=1, max_length=100, description="Search name, phone or member number"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> Page[MemberRead]:
    return await service.list(
        samity_id=samity_id, member_status=member_status, q=q, page=page, size=size
    )


@router.get(
    "/{member_id}",
    response_model=MemberRead,
    responses={403: {"description": "Another member's record"}, 404: {"description": "Member not found"}},
)
async def get_member(member: AccessibleMember) -> Member:
    return member


@router.post(
    "",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Samity or user not found"},
        409: {"description": "Member number already used in this samity"},
    },
)
async def create_member(
    data: MemberCreate, _: AdminUser, service: MemberServiceDep
) -> Member:
    return await service.create(data)


@router.patch(
    "/{member_id}",
    response_model=MemberRead,
    responses={404: {"description": "Member not found"}, 409: {"description": "Member number taken"}},
)
async def update_member(
    member_id: int, data: MemberUpdate, _: AdminUser, service: MemberServiceDep
) -> Member:
    return await service.update(member_id, data)


@router.delete(
    "/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Member not found"}, 409: {"description": "Member has transactions"}},
)
async def delete_member(
    member_id: int, _: AdminUser, service: MemberServiceDep
) -> Response:
    await service.delete(member_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.db.session import SessionDep
from app.modules.members.repositories import MemberRepository
from app.modules.members.schemas import MemberRead
from app.modules.members.services import MemberService

router = APIRouter(prefix="/members", tags=["members"])


def get_member_service(session: SessionDep) -> MemberService:
    return MemberService(MemberRepository(session))


ServiceDep = Annotated[MemberService, Depends(get_member_service)]


@router.get("", response_model=list[MemberRead])
async def list_members(
    service: ServiceDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    return await service.list_members(skip, limit)


@router.get("/{user_id}", response_model=MemberRead)
async def get_member(user_id: int, service: ServiceDep):
    return await service.get_member(user_id)
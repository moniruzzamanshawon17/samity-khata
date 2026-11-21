from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.db.session import SessionDep
from app.modules.auth.dependencies import CurrentUser
from app.modules.auth.models import UserRole
from app.modules.members.models import Member
from app.modules.members.repositories import MemberRepository


async def get_accessible_member(
    member_id: int, user: CurrentUser, session: SessionDep
) -> Member:
    """The member in the path, if the caller may see it.

    Admin and staff can see any member; a customer only the member record
    linked to their own account. Reused by balance and transaction routes.
    """
    member = await MemberRepository(session).get(member_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    if user.role == UserRole.CUSTOMER and member.user_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You can only view your own member record"
        )
    return member


AccessibleMember = Annotated[Member, Depends(get_accessible_member)]
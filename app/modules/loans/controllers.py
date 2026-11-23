from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.schemas import Page
from app.db.session import SessionDep
from app.modules.auth.dependencies import AdminUser, CurrentUser, StaffUser
from app.modules.loans.models import LoanStatus
from app.modules.loans.repositories import LoanRepository
from app.modules.loans.schemas import LoanCreate, LoanRead, LoanSchedule
from app.modules.loans.services import LoanService
from app.modules.members.repositories import MemberRepository
from app.modules.samities.repositories import SamityRepository
from app.modules.transactions.repositories import TransactionRepository

router = APIRouter(prefix="/loans", tags=["loans"])


def get_loan_service(session: SessionDep) -> LoanService:
    return LoanService(
        LoanRepository(session),
        MemberRepository(session),
        SamityRepository(session),
        TransactionRepository(session),
    )


LoanServiceDep = Annotated[LoanService, Depends(get_loan_service)]


@router.post(
    "",
    response_model=LoanRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Member not found"},
        409: {"description": "Member already has an open loan"},
        422: {"description": "Not eligible (Clause 4.1) or above the ceiling (Clause 4.2)"},
    },
)
async def create_loan(data: LoanCreate, _: AdminUser, service: LoanServiceDep) -> LoanRead:
    return await service.create(data)


@router.get("", response_model=Page[LoanRead])
async def list_loans(
    _: StaffUser,
    service: LoanServiceDep,
    loan_status: LoanStatus | None = Query(None, alias="status"),
    member_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> Page[LoanRead]:
    return await service.list(loan_status=loan_status, member_id=member_id, page=page, size=size)


@router.get(
    "/{loan_id}",
    response_model=LoanRead,
    responses={403: {"description": "Another member's loan"}, 404: {"description": "Loan not found"}},
)
async def get_loan(loan_id: int, user: CurrentUser, service: LoanServiceDep) -> LoanRead:
    return await service.get(loan_id, user)


@router.get(
    "/{loan_id}/schedule",
    response_model=LoanSchedule,
    responses={403: {"description": "Another member's loan"}, 404: {"description": "Loan not found"}},
)
async def get_loan_schedule(loan_id: int, user: CurrentUser, service: LoanServiceDep) -> LoanSchedule:
    return await service.schedule(loan_id, user)
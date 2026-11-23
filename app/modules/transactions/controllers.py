from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.schemas import Page
from app.db.session import SessionDep
from app.modules.auth.dependencies import AdminUser, CurrentUser, StaffUser
from app.modules.loans.repositories import LoanRepository
from app.modules.members.dependencies import AccessibleMember
from app.modules.members.repositories import MemberRepository
from app.modules.samities.repositories import SamityRepository
from app.modules.transactions.models import Transaction
from app.modules.transactions.repositories import TransactionRepository
from app.modules.transactions.schemas import (
    BalanceRead,
    TransactionCreate,
    TransactionRead,
)
from app.modules.transactions.services import TransactionService

router = APIRouter(prefix="/transactions", tags=["transactions"])
balance_router = APIRouter(prefix="/members", tags=["members"])


def get_transaction_service(session: SessionDep) -> TransactionService:
    return TransactionService(
        TransactionRepository(session),
        MemberRepository(session),
        LoanRepository(session),
        SamityRepository(session),
    )


TransactionServiceDep = Annotated[TransactionService, Depends(get_transaction_service)]


@router.post(
    "",
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"description": "Collectors cannot record withdrawals (Clause 6.2)"},
        404: {"description": "Member or loan not found"},
        422: {"description": "Bad amount, withdrawal limit (Clause 3.5) or bad repayment"},
    },
)
async def record_transaction(
    data: TransactionCreate, user: StaffUser, service: TransactionServiceDep
) -> Transaction:
    return await service.record(data, user)


@router.get(
    "",
    response_model=Page[TransactionRead],
    responses={403: {"description": "Another member's transactions"}},
)
async def list_transactions(
    user: CurrentUser,
    service: TransactionServiceDep,
    member_id: int | None = Query(None, gt=0),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> Page[TransactionRead]:
    return await service.list(
        user,
        member_id=member_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        size=size,
    )


@router.post(
    "/{transaction_id}/reverse",
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Transaction not found"},
        409: {"description": "Already reversed"},
        422: {"description": "Cannot reverse a reversal, or balance would go negative"},
    },
)
async def reverse_transaction(
    transaction_id: int, user: AdminUser, service: TransactionServiceDep
) -> Transaction:
    return await service.reverse(transaction_id, user)


@balance_router.get(
    "/{member_id}/balance",
    response_model=BalanceRead,
    responses={403: {"description": "Another member's balance"}, 404: {"description": "Member not found"}},
)
async def get_balance(member: AccessibleMember, service: TransactionServiceDep) -> BalanceRead:
    return await service.balance(member)

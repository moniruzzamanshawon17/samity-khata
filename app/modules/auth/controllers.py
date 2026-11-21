from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.db.session import SessionDep
from app.modules.auth.dependencies import CurrentUser
from app.modules.auth.models import User
from app.modules.auth.repositories import UserRepository
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserRead
from app.modules.auth.services import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(session: SessionDep) -> AuthService:
    return AuthService(UserRepository(session))


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Email is already registered"}},
)
async def register(data: RegisterRequest, service: AuthServiceDep) -> User:
    return await service.register(data)


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={401: {"description": "Incorrect email or password"}},
)
async def login(data: LoginRequest, service: AuthServiceDep) -> TokenResponse:
    return await service.login(data)


@router.get(
    "/me",
    response_model=UserRead,
    responses={401: {"description": "Invalid or expired token"}},
)
async def me(user: CurrentUser) -> User:
    return user
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from app.modules.auth.models import User, UserRole
from app.modules.auth.repositories import UserRepository
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse

EMAIL_TAKEN = "Email is already registered"
BAD_CREDENTIALS = "Incorrect email or password"


class AuthService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    async def register(self, data: RegisterRequest) -> User:
        email = data.email.lower()
        if await self.repo.get_by_email(email) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN)

        # Public sign-up always creates a customer. Admin and staff accounts
        # are created with scripts/create_user.py.
        user = User(
            name=data.name,
            email=email,
            password_hash=hash_password(data.password),
            role=UserRole.CUSTOMER,
        )
        try:
            return await self.repo.create(user)
        except IntegrityError:
            # Two sign-ups with the same email at the same moment.
            raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN) from None

    async def login(self, data: LoginRequest) -> TokenResponse:
        user = await self.repo.get_by_email(data.email.lower())
        password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
        password_ok = verify_password(data.password, password_hash)

        if user is None or not password_ok:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                BAD_CREDENTIALS,
                headers={"WWW-Authenticate": "Bearer"},
            )

        return TokenResponse(
            access_token=create_access_token(user.id, user.role),
            expires_in=get_settings().JWT_EXPIRE_MINUTES * 60,
        )
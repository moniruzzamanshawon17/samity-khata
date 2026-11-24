import argparse
import asyncio
import getpass
import sys

from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.modules.auth.models import User, UserRole
from app.modules.auth.repositories import UserRepository


async def create_user(name: str, email: str, password: str, role: UserRole) -> None:
    async with SessionLocal() as session:
        repo = UserRepository(session)
        user = User(
            name=name,
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
        )
        try:
            user = await repo.create(user)
        except IntegrityError:
            sys.exit(f"Error: {email} is already registered.")
        print(f"Created {user.role} #{user.id}: {user.email}")
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create an admin or staff account (public sign-up only makes customers)."
    )
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=[r.value for r in UserRole], default="admin")
    args = parser.parse_args()

    password = getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        sys.exit("Error: password must be at least 8 characters.")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Error: passwords do not match.")

    asyncio.run(create_user(args.name, args.email, password, UserRole(args.role)))


if __name__ == "__main__":
    main()
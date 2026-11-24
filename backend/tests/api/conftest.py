"""Fixtures for the API tests: a real, migrated Postgres test database, the app
called in-process, and fake embeddings so no model container is needed.

The database is the one in docker compose (localhost:5433), so start it first:
    docker compose up -d db
If it isn't reachable these tests are skipped, not failed.
"""

import hashlib
import inspect
import math
import re
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import asyncpg
import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.integrations.embeddings import get_embedding_client
from app.main import app
from app.modules.auth.models import User
from app.modules.loans import bylaw_rules as rules

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = "password123"
PASSWORD_HASH = hash_password(PASSWORD)  # hash once: argon2 is slow on purpose
TABLES = "users, samities, members, loans, transactions, bylaw_documents, bylaw_chunks"


def pytest_collection_modifyitems(items):
    for item in items:
        if inspect.iscoroutinefunction(getattr(item, "function", None)):
            item.add_marker(pytest.mark.anyio)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


# ---- database ------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def database():
    """Create the test database if needed and migrate it to head."""
    import asyncio

    settings = get_settings()

    async def ensure_exists() -> None:
        password = settings.DB_PASSWORD
        if hasattr(password, "get_secret_value"):  # SecretStr in config.py
            password = password.get_secret_value()
        conn = await asyncpg.connect(
            user=settings.DB_USER, password=password,
            host=settings.DB_HOST, port=settings.DB_PORT, database="postgres", timeout=5,
        )
        try:
            exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", settings.DB_NAME)
            if not exists:
                await conn.execute(f'CREATE DATABASE "{settings.DB_NAME}"')
        finally:
            await conn.close()

    try:
        asyncio.run(ensure_exists())
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        pytest.skip(f"Postgres not reachable at {settings.DB_HOST}:{settings.DB_PORT} ({exc}); run: docker compose up -d db")

    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    yield
    await engine.dispose()  # each test has its own event loop; don't reuse connections


# ---- fake embeddings -------------------------------------------------------


class FakeEmbeddings:
    """Bag-of-words vectors: texts that share words come out similar."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    def _vector(self, text_: str) -> list[float]:
        vec = [0.0] * self.dim
        for word in re.findall(r"\w+", text_.lower()):
            vec[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dim] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    async def embed_query(self, text_: str) -> list[float]:
        return self._vector(text_)


@pytest.fixture
def embeddings(monkeypatch) -> FakeEmbeddings:
    fake = FakeEmbeddings(get_settings().EMBEDDING_DIM)
    app.dependency_overrides[get_embedding_client] = lambda: fake
    monkeypatch.setattr("app.modules.chat.tools.get_embedding_client", lambda: fake)
    yield fake
    app.dependency_overrides.pop(get_embedding_client, None)


# ---- client and users ------------------------------------------------------


@pytest.fixture
async def client(embeddings) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


class Users:
    """Logged-in headers for each role. customer owns member 'own', not 'other'."""

    admin: dict
    staff: dict
    customer: dict
    customer2: dict
    customer_id: int
    customer2_id: int


@pytest.fixture
async def users(client) -> Users:
    people = {
        "admin": ("Admin", "admin@example.com", "admin"),
        "staff": ("Collector", "staff@example.com", "staff"),
        "customer": ("Rahima", "rahima@example.com", "customer"),
        "customer2": ("Karim", "karim@example.com", "customer"),
    }
    result = Users()
    async with SessionLocal() as session:
        rows = {key: User(name=n, email=e, password_hash=PASSWORD_HASH, role=r) for key, (n, e, r) in people.items()}
        session.add_all(rows.values())
        await session.commit()
        result.customer_id, result.customer2_id = rows["customer"].id, rows["customer2"].id
    for key, (_, email, _) in people.items():
        r = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
        setattr(result, key, {"Authorization": f"Bearer {r.json()['access_token']}"})
    return result


def months_ago(n: int) -> date:
    first = date.today().replace(day=1)
    return rules.add_months(first, -n)


@pytest.fixture
async def samity(client, users) -> dict:
    r = await client.post(
        "/samities",
        json={"name": "Shapla Samity", "union": "Shantinagar", "monthly_deposit_paisa": rules.MONTHLY_DEPOSIT_PAISA},
        headers=users.admin,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def make_member(client, users, samity, no: str, user_id: int | None = None, joined: date | None = None) -> dict:
    r = await client.post(
        "/members",
        json={
            "samity_id": samity["id"], "member_no": no, "name": f"Member {no}", "phone": "01712345678",
            "user_id": user_id, "joined_on": str(joined or months_ago(8)),
        },
        headers=users.admin,
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
async def own(client, users, samity) -> dict:
    """The customer's own member record, joined 8 months ago."""
    return await make_member(client, users, samity, "SSR-0001", users.customer_id)


@pytest.fixture
async def other(client, users, samity) -> dict:
    """Another customer's member record."""
    return await make_member(client, users, samity, "SSR-0002", users.customer2_id)


async def pay_all_deposits(client, users, member: dict) -> int:
    """Deposit every monthly amount due so far; returns the savings in paisa."""
    due = rules.deposits_due(date.fromisoformat(member["joined_on"]), date.today())
    amount = due * rules.MONTHLY_DEPOSIT_PAISA
    r = await client.post(
        "/transactions", json={"member_id": member["id"], "type": "deposit", "amount_paisa": amount}, headers=users.staff
    )
    assert r.status_code == 201, r.text
    return amount
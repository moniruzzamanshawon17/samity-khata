import time

import jwt

from app.core.config import get_settings
from app.core.security import JWT_ALGORITHM


async def test_register_creates_a_customer(client):
    r = await client.post(
        "/auth/register",
        json={"name": "Rahima Begum", "email": "new@example.com", "password": "StrongPass123", "role": "admin"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "customer"  # self-registration can never pick a role
    assert "password" not in str(body) and "hash" not in str(body)


async def test_register_duplicate_email_is_409(client, users):
    r = await client.post(
        "/auth/register", json={"name": "Someone", "email": "admin@example.com", "password": "StrongPass123"}
    )
    assert r.status_code == 409


async def test_register_validates_input(client):
    r = await client.post("/auth/register", json={"name": "X", "email": "not-an-email", "password": "short"})
    assert r.status_code == 422
    fields = {e["loc"][-1] for e in r.json()["detail"]}
    assert {"email", "password"} <= fields


async def test_login_and_me(client, users):
    r = await client.post("/auth/login", json={"email": "staff@example.com", "password": "password123"})
    assert r.status_code == 200
    token = r.json()
    assert token["token_type"] == "bearer" and token["expires_in"] > 0
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"})
    assert me.status_code == 200 and me.json()["role"] == "staff"


async def test_login_wrong_password_and_unknown_email_look_the_same(client, users):
    wrong = await client.post("/auth/login", json={"email": "staff@example.com", "password": "nope"})
    unknown = await client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_me_needs_a_valid_token(client, users):
    assert (await client.get("/auth/me")).status_code == 401
    bad = await client.get("/auth/me", headers={"Authorization": "Bearer junk"})
    assert bad.status_code == 401 and bad.headers["www-authenticate"] == "Bearer"
    expired = jwt.encode({"sub": "1", "exp": int(time.time()) - 5}, get_settings().JWT_SECRET, algorithm=JWT_ALGORITHM)
    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})).status_code == 401
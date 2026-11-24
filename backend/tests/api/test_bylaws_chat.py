from pathlib import Path

import httpx

from app.integrations.llm.base import ChatResult, ToolCall
from app.integrations.llm.client import get_chat_model
from app.main import app
from app.modules.auth.dependencies import get_current_user

BYLAW = Path(__file__).resolve().parents[2] / "data" / "bylaws" / "bylaw_en.md"


async def ingest(client, users, samity, data: bytes | None = None, name: str = "bylaw_en.md"):
    return await client.post(
        "/bylaws/ingest",
        files={"file": (name, data if data is not None else BYLAW.read_bytes())},
        data={"samity_id": str(samity["id"])},
        headers=users.admin,
    )


async def test_ingest_and_replace(client, users, samity):
    r = await ingest(client, users, samity)
    assert r.status_code == 201
    doc = r.json()
    assert doc["chunk_count"] > 10 and doc["replaced"] is False and doc["samity_id"] == samity["id"]

    again = (await ingest(client, users, samity)).json()
    assert again["replaced"] is True
    assert len((await client.get("/bylaws", headers=users.customer)).json()) == 1


async def test_ingest_rejects_bad_files_and_non_admins(client, users, samity):
    assert (await ingest(client, users, samity, b"hello", "notes.txt")).status_code == 422
    assert (await ingest(client, users, samity, b"%PDF-1.4 not really a pdf", "bylaw.pdf")).status_code == 422
    staff = await client.post(
        "/bylaws/ingest", files={"file": ("b.md", b"# T\n\n#### Clause 1.1 - X\nText")}, headers=users.staff
    )
    assert staff.status_code == 403


async def test_search(client, users, samity):
    await ingest(client, users, samity)
    hit = (await client.get("/bylaws/search", params={"q": "fine for a late monthly deposit"}, headers=users.customer)).json()
    assert hit["hits"] and all(h["similarity"] >= hit["threshold"] for h in hit["hits"])
    miss = (await client.get("/bylaws/search", params={"q": "zzqx wvbn"}, headers=users.customer)).json()
    assert miss["hits"] == []
    assert (await client.get("/bylaws/search", params={"q": "x"}, headers=users.customer)).status_code == 422


# ---- chat ------------------------------------------------------------------


class ScriptedModel:
    """Calls the given tools in order, then replies with what they returned."""

    def __init__(self, *calls: ToolCall) -> None:
        self.calls = calls

    async def run(self, *, system, messages, tools, execute):
        results = [await execute(call) for call in self.calls]
        return ChatResult(reply=repr(results), tool_calls=list(self.calls))


def use_model(model) -> None:
    app.dependency_overrides[get_chat_model] = lambda: model


async def test_chat_is_503_until_configured(client, users):
    use_model(None)
    try:
        r = await client.post("/chat", json={"message": "আমার সঞ্চয় কত?"}, headers=users.customer)
        assert r.status_code == 503
        assert (await client.post("/chat", json={"message": "hi"})).status_code == 401
        assert (await client.post("/chat", json={"message": ""}, headers=users.customer)).status_code == 422
    finally:
        app.dependency_overrides.pop(get_chat_model, None)


async def test_chat_tools_respect_permissions(client, users, own, other):
    await client.post(
        "/transactions", json={"member_id": own["id"], "type": "deposit", "amount_paisa": 450000}, headers=users.staff
    )
    use_model(ScriptedModel(ToolCall("get_balance", {"member_id": own["id"]}), ToolCall("get_balance", {"member_id": other["id"]})))
    try:
        r = await client.post("/chat", json={"message": "balances?"}, headers=users.customer)
    finally:
        app.dependency_overrides.pop(get_chat_model, None)
    assert r.status_code == 200
    body = r.json()
    assert "Tk 4,500.00" in body["reply"]  # own balance
    assert "'status': 403" in body["reply"]  # the other member's was refused
    assert [t["name"] for t in body["tools_used"]] == ["get_balance", "get_balance"]


# ---- errors ----------------------------------------------------------------


async def test_unknown_route_is_json_404(client):
    r = await client.get("/does-not-exist")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


async def test_unexpected_error_hides_the_stack_trace(users):
    def boom():
        raise RuntimeError("secret internals")

    app.dependency_overrides[get_current_user] = boom
    try:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
            r = await c.get("/auth/me", headers=users.admin)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert r.status_code == 500
    assert "secret" not in r.text and "Traceback" not in r.text
    assert r.json()["detail"]
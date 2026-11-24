"""MCP server wiring. These need no database: the calls fail before any query."""
import asyncio
import time

import jwt
from mcp.client import Client

from app.core.config import get_settings
from app.core.security import JWT_ALGORITHM, create_access_token
from app.mcp.auth import JwtTokenVerifier
from app.mcp.server import build_server

TOOLS = {
    "who_am_i", "find_members", "get_member", "get_balance",
    "list_transactions", "get_loans", "get_loan_schedule", "search_bylaws",
}


def with_client(server, fn):
    async def go():
        async with Client(server) as client:
            return await fn(client)

    return asyncio.run(go())


def test_lists_tools_resources_and_prompts():
    async def check(c):
        tools = (await c.list_tools()).tools
        assert {t.name for t in tools} == TOOLS
        assert all(t.annotations.read_only_hint for t in tools)
        assert {r.uri for r in (await c.list_resources()).resources} == {"samity://me", "samity://bylaws"}
        templates = {t.uri_template for t in (await c.list_resource_templates()).resource_templates}
        assert templates == {"samity://members/{member_id}", "samity://bylaws/{document_id}"}
        assert {p.name for p in (await c.list_prompts()).prompts} == {
            "member_summary", "explain_rule", "loan_eligibility",
        }

    with_client(build_server(), check)


def test_tool_without_a_user_is_refused():
    result = with_client(build_server(), lambda c: c.call_tool("get_balance", {"member_id": 1}))
    assert result.is_error
    assert "Not signed in" in result.content[0].text


def test_prompt_fills_in_arguments():
    result = with_client(
        build_server(),
        lambda c: c.get_prompt("loan_eligibility", {"member_id": "7", "amount_taka": "25000"}),
    )
    text = result.messages[0].content.text
    assert "member #7" in text and "Tk 25,000" in text


def test_verifier_accepts_api_tokens():
    token = asyncio.run(JwtTokenVerifier().verify_token(create_access_token(5, "customer")))
    assert token is not None and token.subject == "5"


def test_verifier_rejects_bad_and_expired_tokens():
    verifier = JwtTokenVerifier()
    expired = jwt.encode(
        {"sub": "5", "exp": int(time.time()) - 10}, get_settings().JWT_SECRET, algorithm=JWT_ALGORITHM
    )
    forged = jwt.encode({"sub": "5", "exp": int(time.time()) + 600}, "x" * 64, algorithm=JWT_ALGORITHM)
    for bad in ("junk", expired, forged):
        assert asyncio.run(verifier.verify_token(bad)) is None
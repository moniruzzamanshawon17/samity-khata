"""Who an MCP request runs as.

Over HTTP the client sends the same bearer token as the REST API (from
POST /api/v1/auth/login). Over stdio the server runs on your own machine, so it
acts as the user named in MCP_USER_EMAIL.

Either way the role is read from the database on every call, exactly like the
API, so a role change or a deleted account takes effect at once.
"""

import jwt
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.modules.auth.models import User
from app.modules.auth.repositories import UserRepository


class JwtTokenVerifier:
    """Accepts the API's own access tokens."""

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            payload = decode_access_token(token)
            user_id = int(payload["sub"])
        except (jwt.InvalidTokenError, KeyError, ValueError):
            return None
        return AccessToken(
            token=token,
            client_id=f"user-{user_id}",
            scopes=[],
            expires_at=int(payload["exp"]),
            subject=str(user_id),
        )


class NotSignedIn(ToolError):
    pass


async def resolve_user(session: AsyncSession, stdio_user_email: str | None) -> User:
    users = UserRepository(session)
    token = get_access_token()
    if token is not None:
        user = await users.get_by_id(int(token.subject or 0))
    elif stdio_user_email:
        user = await users.get_by_email(stdio_user_email)
    else:
        raise NotSignedIn("Not signed in: set MCP_USER_EMAIL for stdio, or send a bearer token")
    if user is None:
        raise NotSignedIn("This account no longer exists")
    return user
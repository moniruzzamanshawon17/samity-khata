"""Run the MCP server.

    python -m app.mcp                                     # stdio, as MCP_USER_EMAIL
    python -m app.mcp --transport http --port 8001        # streamable HTTP at /mcp
"""

import argparse

from mcp.server.transport_security import TransportSecuritySettings

from app.core.config import get_settings
from app.mcp.server import build_server


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.mcp")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()

    if args.transport == "stdio":
        build_server(stdio_user_email=get_settings().MCP_USER_EMAIL).run("stdio")
        return

    build_server(http=True).run(
        "streamable-http",
        host=args.host,
        port=args.port,
        # Only accept requests addressed to this machine (blocks DNS rebinding).
        transport_security=TransportSecuritySettings(
            allowed_hosts=["localhost:*", "127.0.0.1:*", "mcp:*"],
            allowed_origins=["http://localhost:*", "http://127.0.0.1:*"],
        ),
    )


if __name__ == "__main__":
    main()
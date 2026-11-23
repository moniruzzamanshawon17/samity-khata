"""Ingest a bylaw file (PDF or Markdown) the same way POST /bylaws/ingest does.

    docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_en.md --samity-id 1
    docker compose exec api python -m scripts.ingest_bylaws data/bylaws/bylaw_bn.md --samity-id 1
"""

import argparse
import asyncio
import sys
from pathlib import Path

from app.core.exceptions import AppError
from app.db.session import SessionLocal, engine
from app.integrations.embeddings import get_embedding_client
from app.modules.bylaws.repositories import BylawRepository
from app.modules.bylaws.services import BylawService
from app.modules.samities.repositories import SamityRepository


async def ingest(path: Path, title: str | None, samity_id: int | None) -> None:
    async with SessionLocal() as session:
        service = BylawService(
            session,
            BylawRepository(session),
            SamityRepository(session),
            get_embedding_client(),
        )
        try:
            result = await service.ingest(
                data=path.read_bytes(),
                filename=path.name,
                title=title,
                samity_id=samity_id,
                uploaded_by=None,
            )
        except AppError as exc:
            sys.exit(f"Error ({exc.status_code}): {exc.detail}")
    await engine.dispose()

    action = "Replaced" if result.replaced else "Created"
    print(
        f"{action} document #{result.id} '{result.title}': {result.chunk_count} chunks {result.languages}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a bylaw PDF into the RAG store."
    )
    parser.add_argument("path", type=Path)
    parser.add_argument("--title", help="Defaults to the Markdown title or the file name")
    parser.add_argument("--samity-id", type=int)
    args = parser.parse_args()

    if not args.path.is_file():
        sys.exit(f"Error: {args.path} not found")
    asyncio.run(ingest(args.path, args.title, args.samity_id))


if __name__ == "__main__":
    main()

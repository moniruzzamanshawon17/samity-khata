"""Print bylaw search scores with no threshold, to help choose RAG_SIMILARITY_THRESHOLD.

    docker compose exec api python -m scripts.rag_scores
"""

import asyncio

from app.db.session import SessionLocal, engine
from app.integrations.embeddings import get_embedding_client
from app.modules.bylaws.repositories import BylawRepository

QUESTIONS = [
    ("answered", "What is the fine for a late deposit?"),
    ("answered", "দেরিতে জমা দিলে জরিমানা কত?"),
    ("answered", "How much can I borrow?"),
    ("answered", "ঋণের সুদের হার কত?"),
    ("not in bylaws", "Can I get a loan for a wedding?"),
    ("unrelated", "football world cup"),
    ("unrelated", "how do I cook biryani"),
]


async def main() -> None:
    embedder = get_embedding_client()
    async with SessionLocal() as session:
        repo = BylawRepository(session)
        for kind, question in QUESTIONS:
            vector = await embedder.embed_query(question)
            hits = await repo.search(vector, threshold=0.0, limit=1)
            chunk, score = hits[0]
            clause = chunk.chunk_text.splitlines()[0][:45]
            print(f"{score:.3f}  {kind:<14} {question[:38]:<40} -> {clause}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
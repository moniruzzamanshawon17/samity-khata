"""Client for the text-embeddings-inference (TEI) container.

The model is intfloat/multilingual-e5-small, which expects every input to start
with "passage: " (text being stored) or "query: " (a search question).
"""

import logging
from functools import lru_cache

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 32  # TEI's default max client batch size


class EmbeddingError(RuntimeError):
    """The embedding service is unreachable or returned something unusable."""


class EmbeddingClient:
    def __init__(self, base_url: str, dim: int, timeout: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.dim = dim
        self.timeout = timeout

    async def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return await self._embed([f"passage: {t}" for t in texts])

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([f"query: {text}"]))[0]

    async def _embed(self, inputs: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
            for start in range(0, len(inputs), BATCH_SIZE):
                batch = inputs[start : start + BATCH_SIZE]
                try:
                    response = await client.post("/embed", json={"inputs": batch, "truncate": True})
                    response.raise_for_status()
                    data = response.json()
                except (httpx.HTTPError, ValueError) as exc:
                    logger.warning("Embedding request failed: %s", exc)
                    raise EmbeddingError("Embedding service is unavailable") from exc

                if (
                    not isinstance(data, list)
                    or len(data) != len(batch)
                    or any(len(v) != self.dim for v in data)
                ):
                    raise EmbeddingError(
                        f"Embedding service returned unexpected vectors (expected {self.dim} dimensions)"
                    )
                vectors.extend(data)
        return vectors


@lru_cache
def get_embedding_client() -> EmbeddingClient:
    settings = get_settings()
    return EmbeddingClient(settings.EMBEDDING_URL, settings.EMBEDDING_DIM)
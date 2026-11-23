from functools import lru_cache

from app.core.config import get_settings
from app.integrations.llm.base import ChatModel


@lru_cache
def get_chat_model() -> ChatModel | None:
    """The configured chat model, or None until LLM_API_KEY and LLM_MODEL are set."""
    settings = get_settings()
    if not settings.LLM_API_KEY or not settings.LLM_MODEL:
        return None
    from app.integrations.llm.gemini import GeminiChatModel

    return GeminiChatModel(
        settings.LLM_API_KEY, settings.LLM_MODEL, max_tool_steps=settings.LLM_MAX_TOOL_STEPS
    )
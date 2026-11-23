"""Provider-neutral interface for the chat model.

The chat service only knows this interface. Each provider (Gemini today) owns
its own message format and tool-calling loop, and calls back into our tools
through `execute`.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema for the arguments


@dataclass(frozen=True)
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass
class ChatResult:
    reply: str
    tool_calls: list[ToolCall] = field(default_factory=list)


ToolExecutor = Callable[[ToolCall], Awaitable[dict[str, Any]]]


class LLMError(RuntimeError):
    """The chat model could not be reached or refused the request."""


class LLMRateLimited(LLMError):
    """The provider's rate limit or free-tier quota was hit."""


class ChatModel(Protocol):
    async def run(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        tools: list[ToolSpec],
        execute: ToolExecutor,
    ) -> ChatResult:
        """Answer the last user message, calling tools as needed."""
        ...
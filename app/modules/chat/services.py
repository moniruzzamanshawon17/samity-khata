from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceUnavailableError
from app.integrations.llm.base import ChatMessage, ChatModel, LLMError
from app.integrations.llm.prompts import build_system_prompt
from app.modules.auth.models import User
from app.modules.chat.schemas import ChatRequest, ChatResponse, ToolUse
from app.modules.chat.tools import ChatTools


class ChatService:
    def __init__(self, session: AsyncSession, model: ChatModel | None) -> None:
        self.session = session
        self.model = model

    async def reply(self, user: User, data: ChatRequest) -> ChatResponse:
        if self.model is None:
            raise ServiceUnavailableError(
                "Chat model is not configured: set LLM_API_KEY and LLM_MODEL"
            )

        tools = ChatTools(self.session, user)
        system = build_system_prompt(
            name=user.name, role=user.role, own_members=await tools.own_members()
        )
        messages = [ChatMessage(turn.role, turn.content) for turn in data.history]
        messages.append(ChatMessage("user", data.message))

        try:
            result = await self.model.run(
                system=system, messages=messages, tools=tools.specs(), execute=tools.execute
            )
        except LLMError as exc:
            raise ServiceUnavailableError(str(exc)) from None

        return ChatResponse(
            reply=result.reply,
            sources=tools.sources,
            tools_used=[ToolUse(name=c.name, args=c.args) for c in result.tool_calls],
        )
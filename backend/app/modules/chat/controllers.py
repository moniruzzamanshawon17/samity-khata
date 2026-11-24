from typing import Annotated

from fastapi import APIRouter, Depends

from app.db.session import SessionDep
from app.integrations.llm.base import ChatModel
from app.integrations.llm.client import get_chat_model
from app.modules.auth.dependencies import CurrentUser
from app.modules.chat.schemas import ChatRequest, ChatResponse
from app.modules.chat.services import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


def get_chat_service(
    session: SessionDep,
    model: Annotated[ChatModel | None, Depends(get_chat_model)],
) -> ChatService:
    return ChatService(session, model)


@router.post(
    "",
    response_model=ChatResponse,
    responses={
        401: {"description": "Invalid or expired token"},
        503: {"description": "Chat model not configured, busy or unavailable"},
    },
)
async def chat(
    data: ChatRequest,
    user: CurrentUser,
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> ChatResponse:
    """Ask about balances, loans, transactions or the bylaws, in Bangla or English.

    The assistant can only look things up, and only what the caller is allowed to see.
    """
    return await service.reply(user, data)
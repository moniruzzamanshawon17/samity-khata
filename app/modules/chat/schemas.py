from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Message = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChatRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "দেরিতে জমা দিলে জরিমানা কত?",
                "history": [],
            }
        }
    )

    message: Message
    history: list[ChatTurn] = Field(
        default_factory=list,
        max_length=20,
        description="Earlier turns of this conversation, oldest first. The server keeps no chat state.",
    )


class ToolUse(BaseModel):
    name: str
    args: dict[str, Any]


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = Field(description="Bylaw clauses the answer was based on")
    tools_used: list[ToolUse] = Field(description="Lookups the assistant made, in order")
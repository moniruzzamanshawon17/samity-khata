"""Gemini chat model using the google-genai SDK, with manual function calling.

Automatic function calling is turned off so every tool call goes through our
own executor, which applies the caller's role and permissions.
"""

import logging
from typing import Any

from google import genai
from google.genai import errors, types

from app.integrations.llm.base import (
    ChatMessage,
    ChatResult,
    LLMError,
    LLMRateLimited,
    ToolCall,
    ToolExecutor,
    ToolSpec,
)

logger = logging.getLogger(__name__)

NO_ANSWER = "Sorry, I could not finish answering that. Please try asking in a simpler way."


class GeminiChatModel:
    def __init__(self, api_key: str, model: str, max_tool_steps: int = 6) -> None:
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.max_tool_steps = max_tool_steps

    async def run(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        tools: list[ToolSpec],
        execute: ToolExecutor,
    ) -> ChatResult:
        config = types.GenerateContentConfig(
            system_instruction=system,
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=t.name,
                            description=t.description,
                            parameters_json_schema=t.parameters,
                        )
                        for t in tools
                    ]
                )
            ],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        contents: list[types.Content] = [
            types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[types.Part(text=m.content)],
            )
            for m in messages
        ]
        calls_made: list[ToolCall] = []

        for _ in range(self.max_tool_steps + 1):
            response = await self._generate(contents, config)
            function_calls = response.function_calls or []
            if not function_calls:
                return ChatResult(reply=(response.text or "").strip() or NO_ANSWER, tool_calls=calls_made)

            # Send the model's turn back unchanged: it carries Gemini's thought signatures.
            contents.append(response.candidates[0].content)
            results: list[types.Part] = []
            for fc in function_calls:
                call = ToolCall(name=fc.name or "", args=dict(fc.args or {}))
                calls_made.append(call)
                results.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=fc.id, name=call.name, response=await execute(call)
                        )
                    )
                )
            contents.append(types.Content(role="user", parts=results))

        logger.warning("Chat stopped after %d tool steps", self.max_tool_steps)
        return ChatResult(reply=NO_ANSWER, tool_calls=calls_made)

    async def _generate(
        self, contents: list[types.Content], config: types.GenerateContentConfig
    ) -> Any:
        try:
            return await self.client.aio.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except errors.APIError as exc:
            logger.warning("Gemini request failed: %s %s", exc.code, exc.message)
            if exc.code == 429:
                raise LLMRateLimited("The chat model is busy; try again in a minute") from exc
            raise LLMError("The chat model is unavailable") from exc
        except Exception as exc:  # network errors, timeouts
            logger.warning("Gemini request failed: %s", exc)
            raise LLMError("The chat model is unavailable") from exc
"""The Gemini tool loop, using the real google-genai types and a scripted server."""
import asyncio

import pytest
from google.genai import errors, types

from app.integrations.llm.base import (
    ChatMessage,
    LLMError,
    LLMRateLimited,
    ToolCall,
    ToolSpec,
)
from app.integrations.llm.gemini import NO_ANSWER, GeminiChatModel

SPEC = ToolSpec("get_balance", "balance", {"type": "object", "properties": {"member_id": {"type": "integer"}}})


def call_response(*calls):
    parts = [types.Part(function_call=types.FunctionCall(id=f"c{i}", name=n, args=a)) for i, (n, a) in enumerate(calls)]
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role="model", parts=parts))])


def text_response(text):
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text=text)]))])


def model_with(responses, max_steps=6):
    model = GeminiChatModel(api_key="test-key", model="gemini-test", max_tool_steps=max_steps)
    sent = []

    async def fake_generate(*, model, contents, config):
        sent.append((model, list(contents), config))
        result = responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    model.client.aio.models.generate_content = fake_generate
    return model, sent


def run(model, executed=None):
    executed = [] if executed is None else executed

    async def execute(call: ToolCall):
        executed.append(call)
        return {"savings_balance_paisa": 450000, "savings_balance_taka": "Tk 4,500.00"}

    return asyncio.run(model.run(
        system="sys", messages=[ChatMessage("user", "আমার সঞ্চয় কত?")], tools=[SPEC], execute=execute
    ))


def test_calls_tool_then_answers():
    model, sent = model_with([call_response(("get_balance", {"member_id": 7})), text_response("আপনার সঞ্চয় ৪,৫০০ টাকা।")])
    executed = []
    result = run(model, executed)
    assert result.reply == "আপনার সঞ্চয় ৪,৫০০ টাকা।"
    assert executed == [ToolCall("get_balance", {"member_id": 7})]
    assert result.tool_calls == executed
    # Second request: user turn, the model's call (unchanged), then our result with the same id.
    _, contents, config = sent[1]
    assert [c.role for c in contents] == ["user", "model", "user"]
    response_part = contents[2].parts[0].function_response
    assert (response_part.id, response_part.name) == ("c0", "get_balance")
    assert response_part.response["savings_balance_taka"] == "Tk 4,500.00"
    assert config.automatic_function_calling.disable is True
    assert config.system_instruction == "sys"
    assert config.tools[0].function_declarations[0].name == "get_balance"


def test_parallel_calls_all_answered():
    model, sent = model_with([call_response(("get_balance", {"member_id": 1}), ("get_balance", {"member_id": 2})), text_response("ok")])
    executed = []
    run(model, executed)
    assert len(executed) == 2 and len(sent[1][1][2].parts) == 2


def test_history_roles_map_to_gemini():
    model, sent = model_with([text_response("hi")])

    async def go():
        return await model.run(system="s", messages=[ChatMessage("user", "a"), ChatMessage("assistant", "b"), ChatMessage("user", "c")], tools=[SPEC], execute=None)

    asyncio.run(go())
    assert [c.role for c in sent[0][1]] == ["user", "model", "user"]


def test_stops_after_max_tool_steps():
    model, _ = model_with([call_response(("get_balance", {"member_id": 1}))] * 3, max_steps=2)
    assert run(model).reply == NO_ANSWER


def test_empty_text_gets_fallback():
    model, _ = model_with([text_response("   ")])
    assert run(model).reply == NO_ANSWER


def test_rate_limit_and_errors_map_to_llm_errors():
    quota = errors.ClientError(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})
    model, _ = model_with([quota])
    with pytest.raises(LLMRateLimited):
        run(model)
    bad_key = errors.ClientError(400, {"error": {"message": "API key not valid", "status": "INVALID_ARGUMENT"}})
    model, _ = model_with([bad_key])
    with pytest.raises(LLMError):
        run(model)
    model, _ = model_with([TimeoutError("network")])
    with pytest.raises(LLMError):
        run(model)
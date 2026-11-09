"""Offline tests for promptbait.providers — every network call is mocked.

RED phase of Task 2: this module does not exist yet.
"""

from __future__ import annotations

import json

import httpx
import pytest

from promptbait.config import Settings
from promptbait.providers import (
    ChatResponse,
    OllamaProvider,
    OpenAICompatProvider,
    ProviderConfigError,
    ProviderUnavailable,
    ToolCall,
    get_provider,
)


def mock_transport(
    payload: dict | list[dict],
    *,
    status: int = 200,
    record: list[httpx.Request] | None = None,
    exc: Exception | None = None,
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if record is not None:
            record.append(request)
        if exc is not None:
            raise exc
        if isinstance(payload, list):
            body = "\n".join(json.dumps(chunk) for chunk in payload)
            return httpx.Response(status, text=body)
        return httpx.Response(status, json=payload)

    return httpx.MockTransport(handler)


def ollama(*, content=None, tool_calls=None) -> dict:
    message: dict = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {"model": "gpt-oss:120b-cloud", "message": message, "done": True}


@pytest.fixture
def settings() -> Settings:
    return Settings()


# ---------------------------------------------------------------- Ollama


def test_ollama_parses_plain_reply() -> None:
    p = OllamaProvider(model="m", transport=mock_transport(ollama(content="hello")))
    resp = p.chat([{"role": "user", "content": "hi"}])
    assert resp == ChatResponse(content="hello", tool_calls=[])


@pytest.mark.parametrize(
    "arguments",
    [
        {"path": "a.txt"},  # native object
        '{"path": "a.txt"}',  # JSON string (older Ollama)
    ],
)
def test_ollama_parses_tool_calls(arguments: object) -> None:
    payload = ollama(
        content=None,
        tool_calls=[{"function": {"name": "read_file", "arguments": arguments}}],
    )
    p = OllamaProvider(model="m", transport=mock_transport(payload))
    resp = p.chat([{"role": "user", "content": "read"}])
    assert resp.tool_calls == [ToolCall(name="read_file", arguments={"path": "a.txt"})]


def test_ollama_handles_malformed_tool_arguments() -> None:
    payload = ollama(
        tool_calls=[{"function": {"name": "read_file", "arguments": "{not json"}}]
    )
    p = OllamaProvider(model="m", transport=mock_transport(payload))
    call = p.chat([{"role": "user", "content": "read"}]).tool_calls[0]
    assert call.name == "read_file"
    assert call.arguments["_parse_error"] is True
    assert call.arguments["_raw"] == "{not json"


def test_ollama_concatenates_streamed_ndjson_content() -> None:
    chunks = [
        {"message": {"role": "assistant", "content": "hel"}, "done": False},
        {"message": {"role": "assistant", "content": "lo"}, "done": True},
    ]
    p = OllamaProvider(model="m", transport=mock_transport(chunks))
    assert p.chat([{"role": "user", "content": "hi"}]).content == "hello"


def test_ollama_request_shape() -> None:
    record: list[httpx.Request] = []
    p = OllamaProvider(model="gpt-oss:120b-cloud", transport=mock_transport(ollama(content="x"), record=record))
    tools = [{"type": "function", "function": {"name": "read_file", "parameters": {}}}]
    p.chat([{"role": "user", "content": "hi"}], tools=tools, temperature=0.1)
    body = json.loads(record[0].content)
    assert body["model"] == "gpt-oss:120b-cloud"
    assert body["stream"] is False
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert body["tools"] == tools
    assert body["options"]["temperature"] == 0.1


# ------------------------------------------------------- OpenAI-compatible


def openai_compat(*, content=None, tool_calls=None) -> dict:
    message: dict = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {"choices": [{"message": message, "finish_reason": "stop"}]}


def test_openai_compat_maps_messages_and_tools() -> None:
    record: list[httpx.Request] = []
    p = OpenAICompatProvider(
        model="meta-llama/llama-3.3-70b-instruct",
        base_url="https://openrouter.ai/api/v1",
        api_key="k",
        transport=mock_transport(openai_compat(content="ok"), record=record),
    )
    tools = [{"type": "function", "function": {"name": "read_file", "parameters": {}}}]
    p.chat([{"role": "user", "content": "hi"}], tools=tools, temperature=0.3)
    body = json.loads(record[0].content)
    assert record[0].url.path == "/api/v1/chat/completions"
    assert body["model"] == "meta-llama/llama-3.3-70b-instruct"
    assert body["tools"] == tools
    assert body["tool_choice"] == "auto"
    assert body["temperature"] == 0.3
    assert record[0].headers["authorization"] == "Bearer k"


def test_openai_compat_parses_tool_call_arguments_string() -> None:
    payload = openai_compat(
        tool_calls=[
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "send_email",
                    "arguments": '{"to": "x@y.z", "subject": "s", "body": "b"}',
                },
            }
        ]
    )
    p = OpenAICompatProvider(model="m", base_url="https://api.groq.com/openai/v1", api_key="k", transport=mock_transport(payload))
    resp = p.chat([{"role": "user", "content": "go"}])
    assert resp.tool_calls == [
        ToolCall(name="send_email", arguments={"to": "x@y.z", "subject": "s", "body": "b"})
    ]


# ------------------------------------------------------------- failures


@pytest.mark.parametrize("kind", ["ollama", "openai"])
def test_provider_unavailable_on_connect_error(kind: str) -> None:
    transport = mock_transport({}, exc=httpx.ConnectError("refused"))
    provider = (
        OllamaProvider(model="m", transport=transport)
        if kind == "ollama"
        else OpenAICompatProvider(model="m", base_url="https://x/v1", api_key="k", transport=transport)
    )
    with pytest.raises(ProviderUnavailable):
        provider.chat([{"role": "user", "content": "hi"}])


@pytest.mark.parametrize("kind", ["ollama", "openai"])
def test_provider_unavailable_on_http_error(kind: str) -> None:
    transport = mock_transport({}, status=500)
    provider = (
        OllamaProvider(model="m", transport=transport)
        if kind == "ollama"
        else OpenAICompatProvider(model="m", base_url="https://x/v1", api_key="k", transport=transport)
    )
    with pytest.raises(ProviderUnavailable):
        provider.chat([{"role": "user", "content": "hi"}])


# -------------------------------------------------------------- routing


@pytest.mark.parametrize(
    ("model", "cls", "expected_model"),
    [
        ("gpt-oss:120b-cloud", OllamaProvider, "gpt-oss:120b-cloud"),
        ("or/meta-llama/llama-3.3-70b-instruct", OpenAICompatProvider, "meta-llama/llama-3.3-70b-instruct"),
        ("gq/llama-3.3-70b-versatile", OpenAICompatProvider, "llama-3.3-70b-versatile"),
    ],
)
def test_get_provider_routing(model: str, cls: type, expected_model: str, settings: Settings) -> None:
    settings.openrouter_api_key = "or-key"
    settings.groq_api_key = "gq-key"
    provider = get_provider(model, settings)
    assert isinstance(provider, cls)
    assert provider.model == expected_model


@pytest.mark.parametrize("model", ["or/some/model", "gq/some/model"])
def test_get_provider_requires_matching_key(model: str, settings: Settings) -> None:
    with pytest.raises(ProviderConfigError):
        get_provider(model, settings)

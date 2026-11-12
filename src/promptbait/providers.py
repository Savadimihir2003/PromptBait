"""Model providers: Ollama cloud + OpenAI-compatible endpoints (OpenRouter, Groq).

Design notes
------------
* Two wire formats only: Ollama `/api/chat` and OpenAI `/chat/completions`.
* Tool-call arguments arrive either as objects or as JSON strings; both are
  normalised to dicts here so nothing downstream has to guess.
* Malformed argument JSON is never fatal: it becomes
  ``{"_raw": ..., "_parse_error": True}`` and the agent loop decides what to do.
* Transport errors become ``ProviderUnavailable``; the runner records them.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import httpx

from .config import Settings


class ProviderUnavailable(RuntimeError):
    """The model endpoint could not be reached or returned garbage."""


class ProviderConfigError(RuntimeError):
    """A provider was requested but its credentials/endpoint are missing."""


@dataclass
class ToolCall:
    name: str
    arguments: dict
    id: str | None = None


@dataclass
class ChatResponse:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


class BaseProvider(ABC):
    model: str

    def __init__(self, model: str) -> None:
        self.model = model

    @abstractmethod
    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.2,
    ) -> ChatResponse: ...

    def assistant_tool_message(
        self, content: str | None, calls: list[ToolCall]
    ) -> dict:
        """Assistant turn that requests tools, in this provider's wire shape."""
        return {
            "role": "assistant",
            "content": content or "",
            "tool_calls": [
                {"function": {"name": call.name, "arguments": call.arguments}}
                for call in calls
            ],
        }

    def tool_result_message(self, call: ToolCall, content: str) -> dict:
        """Tool result paired with the call it answers, in this provider's shape."""
        return {"role": "tool", "name": call.name, "content": content}


def _normalise_arguments(raw: object) -> dict:
    """dict stays dict; JSON string parses; anything broken is flagged, not raised."""
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return {}
    text = raw if isinstance(raw, str) else json.dumps(raw)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {"_raw": text, "_parse_error": True}
    if isinstance(parsed, dict):
        return parsed
    return {"_raw": text, "_parse_error": True}


class OllamaProvider(BaseProvider):
    def __init__(
        self,
        model: str,
        host: str = "http://localhost:11434",
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        super().__init__(model)
        self._client = httpx.Client(base_url=host, timeout=timeout, transport=transport)

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.2,
    ) -> ChatResponse:
        body: dict = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if tools is not None:
            body["tools"] = tools

        try:
            response = self._client.post("/api/chat", json=body)
        except httpx.HTTPError as exc:  # includes ConnectError, ReadTimeout
            raise ProviderUnavailable(f"ollama unreachable: {exc}") from exc
        if response.status_code != 200:
            snippet = response.text[:300]
            raise ProviderUnavailable(f"ollama http {response.status_code}: {snippet}")

        content_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        try:
            payload = response.json()
            chunks = payload if isinstance(payload, list) else [payload]
        except json.JSONDecodeError:
            chunks = []
            for line in response.text.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    chunks.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise ProviderUnavailable(f"ollama bad ndjson line: {line[:120]}") from exc

        for chunk in chunks:
            if not isinstance(chunk, dict):
                raise ProviderUnavailable(f"ollama malformed chunk: {chunk!r:.120}")
            message = chunk.get("message") or {}
            if not isinstance(message, dict):
                raise ProviderUnavailable(
                    f"ollama malformed message: {message!r:.120}"
                )
            part = message.get("content")
            if part:
                content_parts.append(part)
            for call in message.get("tool_calls") or []:
                if not isinstance(call, dict):
                    raise ProviderUnavailable(
                        f"ollama malformed tool call: {call!r:.120}"
                    )
                fn = call.get("function") or {}
                if not isinstance(fn, dict):
                    raise ProviderUnavailable(
                        f"ollama malformed tool function: {fn!r:.120}"
                    )
                tool_calls.append(
                    ToolCall(
                        name=str(fn.get("name") or ""),
                        arguments=_normalise_arguments(fn.get("arguments")),
                        id=str(call.get("id") or "") or None,
                    )
                )

        content = "".join(content_parts) or None
        return ChatResponse(content=content, tool_calls=tool_calls)


class OpenAICompatProvider(BaseProvider):
    def __init__(
        self,
        model: str,
        base_url: str,
        api_key: str,
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        super().__init__(model)
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            transport=transport,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.2,
    ) -> ChatResponse:
        body: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if tools is not None:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        try:
            response = self._client.post("/chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(f"{self.model} unreachable: {exc}") from exc
        if response.status_code != 200:
            snippet = response.text[:300]
            raise ProviderUnavailable(f"{self.model} http {response.status_code}: {snippet}")

        try:
            payload = response.json()
            choice = payload["choices"][0]
            message = choice["message"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise ProviderUnavailable(f"{self.model} malformed response: {response.text[:200]}") from exc
        if not isinstance(message, dict):
            raise ProviderUnavailable(
                f"{self.model} malformed message: {response.text[:200]}"
            )

        calls: list[ToolCall] = []
        for index, call in enumerate(message.get("tool_calls") or [], start=1):
            if not isinstance(call, dict):
                raise ProviderUnavailable(
                    f"{self.model} malformed tool call: {call!r:.120}"
                )
            fn = call.get("function") or {}
            if not isinstance(fn, dict):
                raise ProviderUnavailable(
                    f"{self.model} malformed tool function: {fn!r:.120}"
                )
            calls.append(
                ToolCall(
                    name=str(fn.get("name") or ""),
                    arguments=_normalise_arguments(fn.get("arguments")),
                    id=str(call.get("id") or "") or f"call_{index}",
                )
            )
        return ChatResponse(content=message.get("content"), tool_calls=calls)

    def assistant_tool_message(
        self, content: str | None, calls: list[ToolCall]
    ) -> dict:
        """OpenAI requires an ``id`` and ``type`` on every assistant tool call."""
        for index, call in enumerate(calls, start=1):
            if not call.id:
                call.id = f"call_{index}"
        return {
            "role": "assistant",
            "content": content or "",
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": call.arguments},
                }
                for call in calls
            ],
        }

    def tool_result_message(self, call: ToolCall, content: str) -> dict:
        """OpenAI pairs tool results by ``tool_call_id``, not by name."""
        return {
            "role": "tool",
            "tool_call_id": call.id or "call_1",
            "content": content,
        }


def get_provider(model: str, settings: Settings) -> BaseProvider:
    """Route a model name to its provider; prefixes ``or/`` and ``gq/`` select APIs."""
    if model.startswith("or/"):
        if not settings.openrouter_api_key:
            raise ProviderConfigError(
                "model starts with 'or/' but OPENROUTER_API_KEY is not set"
            )
        return OpenAICompatProvider(
            model=model.removeprefix("or/"),
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
            timeout=settings.http_timeout,
        )
    if model.startswith("gq/"):
        if not settings.groq_api_key:
            raise ProviderConfigError(
                "model starts with 'gq/' but GROQ_API_KEY is not set"
            )
        return OpenAICompatProvider(
            model=model.removeprefix("gq/"),
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.groq_api_key,
            timeout=settings.http_timeout,
        )
    return OllamaProvider(
        model=model, host=settings.ollama_host, timeout=settings.http_timeout
    )

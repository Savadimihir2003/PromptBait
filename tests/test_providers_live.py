"""Live smoke test for the primary Ollama cloud model.

Skipped by default; run with:
    $env:PROMPTBAIT_LIVE="1"; .\\.venv\\Scripts\\pytest.exe tests/test_providers_live.py -v
"""

from __future__ import annotations

import os

import pytest

from promptbait.providers import ChatResponse, OllamaProvider

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.environ.get("PROMPTBAIT_LIVE") != "1",
        reason="set PROMPTBAIT_LIVE=1 to hit real models",
    ),
]

ECHO_TOOL = {
    "type": "function",
    "function": {
        "name": "echo",
        "description": "Echo the given text back.",
        "parameters": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
}


def test_smoke_ollama_cloud_tool_call() -> None:
    provider = OllamaProvider(model="gpt-oss:120b-cloud", timeout=180.0)
    response = provider.chat(
        [
            {
                "role": "user",
                "content": "Call the echo tool with text 'ping'. Do not answer in prose.",
            }
        ],
        tools=[ECHO_TOOL],
        temperature=0.0,
    )
    assert isinstance(response, ChatResponse)
    assert response.tool_calls, (
        f"expected a tool call, got content={response.content!r}"
    )
    assert response.tool_calls[0].name == "echo"
    assert response.tool_calls[0].arguments.get("text") == "ping"

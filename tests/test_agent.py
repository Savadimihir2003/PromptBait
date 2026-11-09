"""Offline tests for promptbait.agent using a scripted provider test double.

RED phase of Task 4: promptbait.agent does not exist yet.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from promptbait.agent import (
    DEFAULT_SYSTEM_PROMPT,
    AgentOutcome,
    Step,
    ToolEvent,
    run_agent,
)
from promptbait.providers import BaseProvider, ChatResponse, ProviderUnavailable, ToolCall
from promptbait.tools import ToolRegistry


class ScriptedProvider(BaseProvider):
    """Replays a fixed queue of ChatResponses and records every message list."""

    def __init__(self, responses: list[ChatResponse | Exception], model: str = "scripted") -> None:
        super().__init__(model)
        self._responses = list(responses)
        self.calls: list[list[dict]] = []

    def chat(self, messages, tools=None, temperature=0.2):  # type: ignore[override]
        self.calls.append([dict(message) for message in messages])
        if not self._responses:
            raise AssertionError("ScriptedProvider exhausted: agent looped more than scripted")
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@dataclass
class Env:
    provider: ScriptedProvider
    registry: ToolRegistry
    sandbox: Path
    outdir: Path


@pytest.fixture
def env(tmp_path: Path) -> Env:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=tmp_path / ".outbox")
    outdir = tmp_path / "run"
    provider = ScriptedProvider([])
    return Env(provider=provider, registry=registry, sandbox=sandbox, outdir=outdir)


def call(name: str, **arguments: object) -> ChatResponse:
    return ChatResponse(content=None, tool_calls=[ToolCall(name=name, arguments=arguments)])


def test_simple_answer_no_tools(env: Env) -> None:
    env.provider = ScriptedProvider([ChatResponse(content="done", tool_calls=[])])
    outcome = run_agent(
        "say hi",
        env.provider,
        env.registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=env.outdir,
    )
    assert outcome.final_answer == "done"
    assert outcome.tool_events == []
    assert outcome.hit_step_cap is False
    assert outcome.steps[-1].role == "assistant"


def test_tool_roundtrip_and_finish(env: Env) -> None:
    (env.sandbox / "notes.txt").write_text("the notes", encoding="utf-8")
    env.provider = ScriptedProvider(
        [call("read_file", path="notes.txt"), ChatResponse(content="summary: the notes", tool_calls=[])]
    )
    outcome = run_agent(
        "summarise notes.txt",
        env.provider,
        env.registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=env.outdir,
    )
    assert outcome.final_answer == "summary: the notes"
    assert len(outcome.tool_events) == 1
    event = outcome.tool_events[0]
    assert event.name == "read_file" and event.ok is True and event.output == "the notes"
    assert outcome.hit_step_cap is False
    # the tool result was fed back to the model on its second turn
    assert any(message.get("content") == "the notes" for message in env.provider.calls[1])


def test_step_cap_stops_loop(env: Env) -> None:
    env.provider = ScriptedProvider([call("read_file", path="notes.txt")] * 5)
    outcome = run_agent(
        "loop forever",
        env.provider,
        env.registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=env.outdir,
        max_steps=3,
    )
    assert outcome.hit_step_cap is True
    assert outcome.final_answer is None
    assert len(outcome.tool_events) == 3
    assert len(env.provider.calls) == 3


@pytest.mark.parametrize(
    "bad_call",
    [
        call("launch_missiles", target="earth"),  # unknown tool
        call("read_file", path=123),  # wrong arg type
        call("send_email"),  # missing required args
        ChatResponse(content=None, tool_calls=[ToolCall(name="", arguments={})]),  # empty name
    ],
)
def test_agent_survives_malformed_tool_calls(env: Env, bad_call: ChatResponse) -> None:
    env.provider = ScriptedProvider([bad_call] * 4)
    outcome = run_agent(
        "do something broken",
        env.provider,
        env.registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=env.outdir,
        max_steps=4,
    )
    assert outcome.hit_step_cap is True
    assert len(outcome.tool_events) == 4
    assert all(event.ok is False for event in outcome.tool_events)


def test_transcript_written(env: Env) -> None:
    (env.sandbox / "notes.txt").write_text("n", encoding="utf-8")
    env.provider = ScriptedProvider([call("read_file", path="notes.txt"), ChatResponse(content="ok")])
    run_agent(
        "go",
        env.provider,
        env.registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=env.outdir,
    )
    transcript = env.outdir / "transcript.jsonl"
    assert transcript.is_file()
    rows = [json.loads(line) for line in transcript.read_text(encoding="utf-8").splitlines()]
    assert rows
    assert all("role" in row for row in rows)
    assert any(row["tool_name"] == "read_file" for row in rows)


def test_provider_failure_propagates(env: Env) -> None:
    env.provider = ScriptedProvider([ProviderUnavailable("down")])
    with pytest.raises(ProviderUnavailable):
        run_agent(
            "go",
            env.provider,
            env.registry,
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            outdir=env.outdir,
        )


def test_outcome_dataclasses_are_the_documented_shape(env: Env) -> None:
    env.provider = ScriptedProvider([ChatResponse(content="x")])
    outcome = run_agent(
        "go", env.provider, env.registry, system_prompt="s", outdir=env.outdir
    )
    assert isinstance(outcome, AgentOutcome)
    assert all(isinstance(step, Step) for step in outcome.steps)
    assert all(isinstance(event, ToolEvent) for event in outcome.tool_events)

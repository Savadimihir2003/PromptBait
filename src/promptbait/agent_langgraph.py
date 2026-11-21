"""LangGraph-powered tool-calling agent implementation.

Drop-in replacement for promptbait.agent.run_agent using LangGraph's StateGraph.
Adheres strictly to the AgentOutcome, Step, and transcript.jsonl conventions
so all downstream evaluation judges, runners, and reports work identically.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, TypedDict

try:
    from langgraph.graph import END, StateGraph
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False

from .agent import AgentOutcome, Step, ToolEvent
from .defense import DefenseConfig, harden_system_prompt, spotlight_tool_output
from .providers import BaseProvider, ProviderUnavailable, ToolCall
from .tools import ToolRegistry


class AgentGraphState(TypedDict, total=False):
    messages: list[dict]
    steps: list[Step]
    tool_events: list[ToolEvent]
    final_answer: str | None
    step_count: int
    hit_step_cap: bool
    should_stop: bool
    pending_tool_calls: list[ToolCall]


def run_agent_langgraph(
    user_task: str,
    provider: BaseProvider,
    registry: ToolRegistry,
    *,
    system_prompt: str,
    outdir: Path,
    max_steps: int = 8,
    temperature: float = 0.2,
    defense: DefenseConfig | None = None,
) -> AgentOutcome:
    """Run one task to completion or step cap using a LangGraph StateGraph workflow."""
    if not HAS_LANGGRAPH:
        raise ImportError(
            "langgraph is not installed. Install with `pip install langgraph langchain-core`"
        )

    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    if defense is not None and defense.hardened_prompt:
        system_prompt = harden_system_prompt(system_prompt)
    registry.set_defense(defense)

    transcript_path = outdir / "transcript.jsonl"
    transcript_file = transcript_path.open("w", encoding="utf-8")

    def record_step(step: Step, state_steps: list[Step]) -> None:
        state_steps.append(step)
        transcript_file.write(json.dumps(asdict(step), ensure_ascii=False) + "\n")
        transcript_file.flush()

    def call_model(state: AgentGraphState) -> AgentGraphState:
        if state.get("step_count", 0) >= max_steps:
            return {
                "hit_step_cap": True,
                "should_stop": True,
            }

        response = provider.chat(
            state["messages"],
            tools=registry.json_schemas(),
            temperature=temperature,
        )

        steps = list(state.get("steps", []))
        messages = list(state.get("messages", []))

        if not response.tool_calls:
            if not (response.content or "").strip():
                raise ProviderUnavailable(
                    "provider returned neither content nor tool calls"
                )
            final_answer = response.content
            step = Step(role="assistant", content=final_answer)
            record_step(step, steps)
            return {
                "final_answer": final_answer,
                "steps": steps,
                "step_count": state.get("step_count", 0) + 1,
                "hit_step_cap": False,
                "should_stop": True,
                "pending_tool_calls": [],
            }

        messages.append(
            provider.assistant_tool_message(response.content, response.tool_calls)
        )
        step = Step(role="assistant", content=response.content)
        record_step(step, steps)

        return {
            "messages": messages,
            "steps": steps,
            "step_count": state.get("step_count", 0) + 1,
            "pending_tool_calls": response.tool_calls,
            "should_stop": False,
        }

    def execute_tools(state: AgentGraphState) -> AgentGraphState:
        pending_calls = state.get("pending_tool_calls", [])
        events = list(state.get("tool_events", []))
        steps = list(state.get("steps", []))
        messages = list(state.get("messages", []))

        for call in pending_calls:
            result = registry.execute(call.name, call.arguments)
            events.append(
                ToolEvent(
                    name=call.name,
                    args=call.arguments,
                    ok=result.ok,
                    output=result.output,
                )
            )
            step = Step(
                role="tool",
                tool_name=call.name,
                tool_args=call.arguments,
                tool_ok=result.ok,
                tool_output=result.output,
            )
            record_step(step, steps)

            content = (
                spotlight_tool_output(result.output)
                if defense is not None and defense.spotlight_tool_outputs
                else result.output
            )
            messages.append(provider.tool_result_message(call, content))

        return {
            "messages": messages,
            "steps": steps,
            "tool_events": events,
            "pending_tool_calls": [],
        }

    def route_after_model(state: AgentGraphState) -> str:
        if state.get("should_stop", False):
            return END
        if state.get("pending_tool_calls"):
            return "tools"
        return END

    def route_after_tools(state: AgentGraphState) -> str:
        if state.get("step_count", 0) >= max_steps:
            return END
        return "model"

    workflow = StateGraph(AgentGraphState)
    workflow.add_node("model", call_model)
    workflow.add_node("tools", execute_tools)

    workflow.set_entry_point("model")
    workflow.add_conditional_edges(
        "model",
        route_after_model,
        {"tools": "tools", END: END},
    )
    workflow.add_conditional_edges(
        "tools",
        route_after_tools,
        {"model": "model", END: END},
    )

    app = workflow.compile()

    initial_state: AgentGraphState = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_task},
        ],
        "steps": [],
        "tool_events": [],
        "final_answer": None,
        "step_count": 0,
        "hit_step_cap": True,
        "should_stop": False,
        "pending_tool_calls": [],
    }

    try:
        final_state = app.invoke(initial_state)
    finally:
        transcript_file.close()

    return AgentOutcome(
        final_answer=final_state.get("final_answer"),
        steps=final_state.get("steps", []),
        tool_events=final_state.get("tool_events", []),
        hit_step_cap=final_state.get("hit_step_cap", True),
    )

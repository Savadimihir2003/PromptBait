"""Manual end-to-end smoke test: run one golden task and show the evidence.

    $env:PROMPTBAIT_LIVE="1"
    .\\.venv\\Scripts\\python.exe examples\\manual_smoke.py

Requires Ollama with gpt-oss:120b-cloud available (or set DEFAULT_MODEL in .env).
"""

from __future__ import annotations

import sys
from pathlib import Path

from promptbait.agent import DEFAULT_SYSTEM_PROMPT, run_agent
from promptbait.config import Settings
from promptbait.golden import GOLDEN_TASKS, check_outcome
from promptbait.providers import get_provider
from promptbait.tools import ToolRegistry


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    settings = Settings()
    task = GOLDEN_TASKS[0]  # g1: read a notes file, quote its deadline marker

    run_root = Path("runs") / "manual-smoke"
    sandbox = run_root / "sandbox"
    sandbox.mkdir(parents=True, exist_ok=True)
    for relative, content in task.seed_files.items():
        target = sandbox / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    registry = ToolRegistry(sandbox=sandbox, outbox_dir=run_root / ".outbox")
    provider = get_provider(settings.default_model, settings)

    outcome = run_agent(
        task.user_task,
        provider,
        registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=run_root,
        max_steps=settings.max_steps,
    )

    ok, reason = check_outcome(task, outcome, sandbox)
    print("model:", settings.default_model)
    print("final answer:", outcome.final_answer)
    print("tool calls:", [(event.name, event.ok) for event in outcome.tool_events])
    print("golden check:", "PASS" if ok else f"FAIL - {reason}")
    print("transcript:", (run_root / "transcript.jsonl").resolve())
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

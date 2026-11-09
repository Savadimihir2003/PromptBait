"""Live golden-task suite: five ordinary chores the agent must do correctly.

Run with:
    $env:PROMPTBAIT_LIVE="1"; .\\.venv\\Scripts\\pytest.exe tests/test_golden_live.py -v
"""

from __future__ import annotations

import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from promptbait.agent import DEFAULT_SYSTEM_PROMPT, run_agent
from promptbait.config import Settings
from promptbait.golden import GOLDEN_TASKS, GoldenTask, check_outcome
from promptbait.providers import get_provider
from promptbait.tools import ToolRegistry

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.environ.get("PROMPTBAIT_LIVE") != "1",
        reason="set PROMPTBAIT_LIVE=1 to hit real models",
    ),
]

PAGE_HTML = b"<html><body>New policy: PAGE-MARKER-77 is the internal reference.</body></html>"


class _PageHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(PAGE_HTML)

    def log_message(self, *args: object) -> None:  # silence test output
        pass


@pytest.fixture(scope="module")
def page_url() -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _PageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/policy"
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.parametrize("task", GOLDEN_TASKS, ids=[task.id for task in GOLDEN_TASKS])
def test_golden_task(task: GoldenTask, page_url: str, tmp_path: Path) -> None:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    for relative, content in task.seed_files.items():
        target = sandbox / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    settings = Settings()
    registry = ToolRegistry(sandbox=sandbox, outbox_dir=tmp_path / ".outbox")
    provider = get_provider(settings.default_model, settings)

    user_task = task.user_task
    if task.needs_url:
        user_task = user_task.format(url=page_url)

    outcome = run_agent(
        user_task,
        provider,
        registry,
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        outdir=tmp_path / "run",
        max_steps=6,
    )

    ok, reason = check_outcome(task, outcome, sandbox)
    assert ok, f"{task.id} failed: {reason}"

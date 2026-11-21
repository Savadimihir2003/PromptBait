"""WebSocket live streaming handler for real-time attack evaluations."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..agent import DEFAULT_SYSTEM_PROMPT
from ..attacks import load_cases
from ..config import Settings
from ..defense import DEFENSE_V1
from ..judge import judge_case
from ..providers import get_provider
from ..sandbox import prepare_run_dir, seed_sandbox
from ..staging import AttackServer
from ..tools import ToolRegistry

ws_router = APIRouter()


@ws_router.websocket("/ws/run")
async def run_attack_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        raw_msg = await websocket.receive_text()
        req = json.loads(raw_msg)
        model = req.get("model", "qwen2.5:3b")
        case_id = req.get("case_id", "DIR-01")
        defense_name = req.get("defense", "none")
        agent_version = req.get("agent_version", "v1")

        cases = load_cases()
        case = next((c for c in cases if c.id == case_id), None)
        if not case:
            await websocket.send_json({"type": "error", "message": f"Unknown case: {case_id}"})
            await websocket.close()
            return

        settings = Settings()
        defense = DEFENSE_V1 if defense_name == "v1" else None

        # Prepare run directory
        base_dir = Path("runs")
        run_label = f"{model}__live"
        run_dir = prepare_run_dir(base_dir, run_label, case.id)
        sandbox = run_dir / "sandbox"
        outbox = run_dir / ".outbox"

        await websocket.send_json({
            "type": "started",
            "case_id": case.id,
            "model": model,
            "agent_version": agent_version,
            "defense": defense_name,
            "run_dir": str(run_dir),
        })

        # Set up attack server if url delivery
        server = None
        url = ""
        if case.uses_url and case.payload:
            server = AttackServer({case.id: case.payload})
            server.start()
            url = server.url(case.id)

        try:
            user_task = case.user_task.replace("{url}", url) if url else case.user_task
            seeds = {
                k: (v.replace("{url}", url) if url else v)
                for k, v in (case.seed_files or {}).items()
            }
            seed_sandbox(sandbox, seeds)
            (run_dir / "seed_manifest.json").write_text(
                json.dumps(seeds, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            origins = set()
            if url:
                from urllib.parse import urlsplit
                sp = urlsplit(url)
                origins.add(f"{sp.scheme}://{sp.netloc}".lower())

            registry = ToolRegistry(
                sandbox=sandbox,
                outbox_dir=outbox,
                http_timeout=settings.http_timeout,
                allowed_origins=origins,
            )

            provider = get_provider(model, settings)

            # Background runner
            def run_sync():
                with registry:
                    if agent_version == "langgraph":
                        from ..agent_langgraph import run_agent_langgraph
                        return run_agent_langgraph(
                            user_task,
                            provider,
                            registry,
                            system_prompt=DEFAULT_SYSTEM_PROMPT,
                            outdir=run_dir,
                            max_steps=settings.max_steps,
                            temperature=settings.llm_temperature,
                            defense=defense,
                        )
                    else:
                        from ..agent import run_agent
                        return run_agent(
                            user_task,
                            provider,
                            registry,
                            system_prompt=DEFAULT_SYSTEM_PROMPT,
                            outdir=run_dir,
                            max_steps=settings.max_steps,
                            temperature=settings.llm_temperature,
                            defense=defense,
                        )

            # Polling task for transcript streaming
            transcript_file = run_dir / "transcript.jsonl"
            lines_sent = 0
            agent_task = asyncio.create_task(asyncio.to_thread(run_sync))

            while not agent_task.done():
                await asyncio.sleep(0.3)
                if transcript_file.exists():
                    lines = transcript_file.read_text(encoding="utf-8", errors="replace").splitlines()
                    while lines_sent < len(lines):
                        line_text = lines[lines_sent].strip()
                        lines_sent += 1
                        if line_text:
                            try:
                                step_data = json.loads(line_text)
                                await websocket.send_json({"type": "step", "step": step_data})
                            except Exception:
                                pass

            # Await outcome
            outcome = await agent_task

            # Flush any remaining transcript lines
            if transcript_file.exists():
                lines = transcript_file.read_text(encoding="utf-8", errors="replace").splitlines()
                while lines_sent < len(lines):
                    line_text = lines[lines_sent].strip()
                    lines_sent += 1
                    if line_text:
                        try:
                            step_data = json.loads(line_text)
                            await websocket.send_json({"type": "step", "step": step_data})
                        except Exception:
                            pass

            # Score verdict
            verdict, evidence = judge_case(case, outcome, run_dir)
            await websocket.send_json({
                "type": "verdict",
                "verdict": verdict,
                "evidence": evidence,
                "final_answer": outcome.final_answer,
                "used_steps": len(outcome.steps),
            })
            await websocket.send_json({"type": "complete"})

        finally:
            if server:
                server.stop()

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass

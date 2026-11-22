"""WebSocket live streaming handler for real-time attack evaluations."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..agent import DEFAULT_SYSTEM_PROMPT
from ..attacks import AttackCase, load_cases
from ..config import Settings
from ..defense import DEFENSE_V1
from ..judge import judge_case
from ..providers import get_provider
from ..sandbox import prepare_run_dir, safe_model_dir, seed_sandbox
from ..staging import AttackServer
from ..tools import ToolRegistry

ws_router = APIRouter()


def _persist_ws_result(
    base_dir: Path,
    run_label: str,
    record: dict[str, Any],
) -> None:
    """Atomically append or update a case result in the model's results.jsonl."""
    model_dir = base_dir / run_label
    model_dir.mkdir(parents=True, exist_ok=True)
    results_path = model_dir / "results.jsonl"

    rows: list[dict[str, Any]] = []
    if results_path.is_file():
        for line in results_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass

    # Remove any existing entry for this case_id and insert newest run at index 0 (top)
    rows = [r for r in rows if r.get("case_id") != record.get("case_id")]
    rows.insert(0, record)

    temp_path = results_path.with_suffix(".jsonl.tmp")
    temp_path.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows),
        encoding="utf-8",
    )
    temp_path.replace(results_path)


async def run_single_case(
    websocket: WebSocket,
    case: AttackCase,
    model: str,
    defense_name: str,
    agent_version: str,
    settings: Settings,
) -> dict[str, Any]:
    """Run a single attack case, stream transcript steps, and persist results to results.jsonl."""
    defense = DEFENSE_V1 if defense_name == "v1" else None

    suffix = f"__defense-{defense_name}" if defense_name != "none" else ""
    run_label = f"{safe_model_dir(model)}{suffix}"
    base_dir = Path("runs")
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

        origins: set[str] = set()
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

        outcome = await agent_task

        # Flush remaining transcript lines
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

        verdict, evidence = judge_case(case, outcome, run_dir)

        # Deterministically persist result to results.jsonl
        record = {
            "case_id": case.id,
            "category": case.category,
            "delivery": case.delivery,
            "model": model,
            "verdict": verdict,
            "evidence": evidence,
            "outcome_summary": (outcome.final_answer or "")[:400],
            "used_steps": len(outcome.steps),
            "run_dir": run_dir.relative_to(base_dir).as_posix(),
            "defense": defense_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _persist_ws_result(base_dir, run_label, record)

        return {
            "case_id": case.id,
            "verdict": verdict,
            "evidence": evidence,
            "final_answer": outcome.final_answer,
            "used_steps": len(outcome.steps),
        }

    except Exception as exc:
        # Save error row to results.jsonl so dashboard stays in sync
        error_record = {
            "case_id": case.id,
            "category": case.category,
            "delivery": case.delivery,
            "model": model,
            "verdict": "error",
            "evidence": [str(exc)],
            "outcome_summary": str(exc)[:400],
            "used_steps": 0,
            "run_dir": run_dir.relative_to(base_dir).as_posix(),
            "defense": defense_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _persist_ws_result(base_dir, run_label, error_record)
        raise

    finally:
        if server:
            server.stop()


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

        settings = Settings()

        # ------------------------------------------------------------------ #
        # Sweep mode (Category or Full Suite)                                #
        # ------------------------------------------------------------------ #
        is_sweep = case_id in ("*", "ALL") or case_id.endswith("-*") or case_id.endswith("_sweep")

        if is_sweep:
            category_filter = None
            if case_id.endswith("-*") and len(case_id) > 2:
                category_filter = case_id[:-2]

            all_cases = load_cases()
            sweep_cases = [
                c for c in all_cases
                if (category_filter is None or c.category == category_filter)
            ]

            await websocket.send_json({
                "type": "sweep_start",
                "total": len(sweep_cases),
                "category": category_filter or "ALL",
            })

            # Send provider info
            provider = get_provider(model, settings)
            provider_class = type(provider).__name__
            await websocket.send_json({
                "type": "provider_info",
                "provider": provider_class,
                "model": model,
                "api_base": getattr(provider, "base_url", getattr(provider, "api_base", "local")),
            })

            is_groq = model.startswith("gq/")
            sweep_results: list[dict[str, Any]] = []

            for idx, sweep_case in enumerate(sweep_cases):
                await websocket.send_json({
                    "type": "case_start",
                    "case_id": sweep_case.id,
                    "index": idx,
                    "total": len(sweep_cases),
                })
                try:
                    result = await run_single_case(
                        websocket, sweep_case, model, defense_name, agent_version, settings
                    )
                    sweep_results.append(result)
                    await websocket.send_json({
                        "type": "case_complete",
                        "case_id": sweep_case.id,
                        "verdict": result["verdict"],
                        "evidence": result["evidence"],
                    })
                except Exception as exc:
                    await websocket.send_json({
                        "type": "case_error",
                        "case_id": sweep_case.id,
                        "message": str(exc),
                    })

                # Rate-limit delay between Groq calls
                if is_groq and idx < len(sweep_cases) - 1:
                    await asyncio.sleep(2.5)

            await websocket.send_json({"type": "sweep_complete", "results": sweep_results})
            await websocket.close()
            return

        # ------------------------------------------------------------------ #
        # Single-case mode                                                    #
        # ------------------------------------------------------------------ #
        cases = load_cases()
        case = next((c for c in cases if c.id == case_id), None)
        if not case:
            await websocket.send_json({"type": "error", "message": f"Unknown case: {case_id}"})
            await websocket.close()
            return

        # Send provider info
        provider = get_provider(model, settings)
        provider_class = type(provider).__name__
        await websocket.send_json({
            "type": "provider_info",
            "provider": provider_class,
            "model": model,
            "api_base": getattr(provider, "base_url", getattr(provider, "api_base", "local")),
        })

        result = await run_single_case(websocket, case, model, defense_name, agent_version, settings)

        await websocket.send_json({
            "type": "verdict",
            "verdict": result["verdict"],
            "evidence": result["evidence"],
            "final_answer": result["final_answer"],
            "used_steps": result["used_steps"],
        })
        await websocket.send_json({"type": "complete"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass

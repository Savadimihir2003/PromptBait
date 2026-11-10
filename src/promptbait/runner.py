"""Resumable attack-suite runner: cases -> sandboxed agent runs -> verdicts.

Every case gets its own run directory and outbox. Results are appended one
JSON line at a time, so an interrupted suite loses at most the case in flight
and can be resumed without re-burning model calls. A provider outage is
recorded as ``error`` and the suite keeps going.
"""

from __future__ import annotations

import json
import logging
from contextlib import ExitStack
from pathlib import Path
from typing import Sequence

from .agent import DEFAULT_SYSTEM_PROMPT, AgentOutcome, run_agent
from .attacks import CASES_PATH, CATEGORIES, AttackCase, load_cases
from .config import Settings
from .judge import LLMJudge, judge_case
from .providers import BaseProvider, ProviderUnavailable, get_provider
from .sandbox import prepare_run_dir, safe_model_dir, seed_sandbox
from .staging import AttackServer
from .tools import ToolRegistry

logger = logging.getLogger("promptbait.runner")


def run_suite(
    model: str,
    settings: Settings,
    *,
    only_categories: Sequence[str] | None = None,
    resume: bool = True,
    cases: Sequence[AttackCase] | None = None,
    cases_path: Path = CASES_PATH,
    base_dir: Path | None = None,
    provider: BaseProvider | None = None,
    llm_judge: LLMJudge | None = None,
) -> Path:
    """Run the selected cases for one model; return the results.jsonl path.

    ``cases``/``provider``/``base_dir`` are test seams; production callers pass
    a model name and settings only.
    """
    selected = _select_cases(cases, cases_path, only_categories)
    base = Path(base_dir) if base_dir is not None else Path(settings.outdir)
    model_root = base / safe_model_dir(model)
    model_root.mkdir(parents=True, exist_ok=True)
    results_path = model_root / "results.jsonl"

    if not resume and results_path.exists():
        results_path.unlink()
    completed = (
        {row.get("case_id") for row in read_results(results_path)} if resume else set()
    )
    pending = [case for case in selected if case.id not in completed]

    active_provider = provider or get_provider(model, settings)
    pages = {
        case.id: case.payload
        for case in pending
        if case.uses_url and case.payload
    }

    with ExitStack() as stack:
        server = stack.enter_context(AttackServer(pages)) if pages else None
        for index, case in enumerate(pending, start=1):
            _run_one_case(
                case=case,
                index=index,
                total=len(pending),
                model=model,
                settings=settings,
                base=base,
                provider=active_provider,
                llm_judge=llm_judge,
                server=server,
                results_path=results_path,
            )

    return results_path


def read_results(path: Path) -> list[dict]:
    """Read a results JSONL file, skipping malformed lines (never raises)."""
    results_path = Path(path)
    if not results_path.is_file():
        return []
    rows: list[dict] = []
    for line in results_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("skipping malformed results line: %s", line[:120])
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows


# --------------------------------------------------------------------- internals


def _select_cases(
    cases: Sequence[AttackCase] | None,
    cases_path: Path,
    only_categories: Sequence[str] | None,
) -> list[AttackCase]:
    selected = list(cases) if cases is not None else load_cases(cases_path)
    if only_categories is None:
        return selected
    requested = [category.upper() for category in only_categories]
    unknown = set(requested) - set(CATEGORIES)
    if unknown:
        raise ValueError(
            f"unknown category/categories {sorted(unknown)}; expected {list(CATEGORIES)}"
        )
    return [case for case in selected if case.category in requested]


def _run_one_case(
    *,
    case: AttackCase,
    index: int,
    total: int,
    model: str,
    settings: Settings,
    base: Path,
    provider: BaseProvider,
    llm_judge: LLMJudge | None,
    server: AttackServer | None,
    results_path: Path,
) -> None:
    run_dir = prepare_run_dir(base, model, case.id)
    sandbox = run_dir / "sandbox"
    outbox = run_dir / ".outbox"
    url = server.url(case.id) if server is not None and case.uses_url else ""

    user_task = _substitute(case.user_task, url)
    seeds = {
        relative: _substitute(content, url)
        for relative, content in (case.seed_files or {}).items()
    }
    seed_sandbox(sandbox, seeds)
    (run_dir / "seed_manifest.json").write_text(
        json.dumps(seeds, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    registry = ToolRegistry(
        sandbox=sandbox,
        outbox_dir=outbox,
        http_timeout=settings.http_timeout,
    )

    try:
        with registry:
            outcome = run_agent(
                user_task,
                provider,
                registry,
                system_prompt=DEFAULT_SYSTEM_PROMPT,
                outdir=run_dir,
                max_steps=settings.max_steps,
            )
    except ProviderUnavailable as exc:
        record = _record(
            case=case,
            model=model,
            verdict="error",
            evidence=[f"provider unavailable: {exc}"],
            outcome_summary="",
            used_steps=0,
        )
        _append(results_path, record)
        logger.warning("[%s/%s %s] error: %s", index, total, case.id, exc)
        return

    try:
        verdict, evidence = judge_case(
            case, outcome, run_dir, llm_judge=llm_judge
        )
    except Exception as exc:  # noqa: BLE001 - one bad case must not abort the suite
        verdict, evidence = "error", [f"judge failed: {exc}"]

    record = _record(
        case=case,
        model=model,
        verdict=verdict,
        evidence=evidence,
        outcome_summary=_summarise(outcome),
        used_steps=len(outcome.steps),
    )
    _append(results_path, record)
    logger.info(
        "[%s/%s %s] %s (steps=%s)",
        index,
        total,
        case.id,
        verdict,
        len(outcome.steps),
    )


def _substitute(text: str, url: str) -> str:
    return text.replace("{url}", url) if url else text


def _record(
    *,
    case: AttackCase,
    model: str,
    verdict: str,
    evidence: list[str],
    outcome_summary: str,
    used_steps: int,
) -> dict:
    return {
        "case_id": case.id,
        "category": case.category,
        "delivery": case.delivery,
        "model": model,
        "verdict": verdict,
        "evidence": evidence,
        "outcome_summary": outcome_summary,
        "used_steps": used_steps,
    }


def _summarise(outcome: AgentOutcome) -> str:
    tools = [(event.name, event.ok) for event in outcome.tool_events]
    summary = (
        f"final={outcome.final_answer!r}; tools={tools}; "
        f"hit_step_cap={outcome.hit_step_cap}"
    )
    return summary[:400]


def _append(results_path: Path, record: dict) -> None:
    with results_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        handle.flush()

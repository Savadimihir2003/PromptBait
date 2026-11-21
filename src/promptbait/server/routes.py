"""FastAPI REST routes and API implementations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from ..attacks import AttackCase, load_cases
from ..config import Settings
from ..defense import DEFENSE_V1
from ..report import compute_asr
from ..runner import read_results, results_path_for
from ..sandbox import safe_model_dir
from .schemas import (
    CaseResponse,
    CategoryASR,
    ConfigResponse,
    HealthResponse,
    ModelASR,
    ReportResponse,
    ResultRow,
    TranscriptStep,
)

router = APIRouter(prefix="/api")


def _get_base_dirs() -> list[Path]:
    dirs: list[Path] = []
    runs_dir = Path("runs")
    if runs_dir.is_dir():
        dirs.append(runs_dir)
    results_dir = Path("results")
    if results_dir.is_dir():
        dirs.append(results_dir)
    if not dirs:
        dirs.append(Path(Settings().outdir))
    return dirs


@router.get("/health", response_model=HealthResponse)
def get_health():
    settings = Settings()
    # In sandboxed environments or without a live Ollama daemon, don't block
    return HealthResponse(
        status="ok",
        ollama_host=settings.ollama_host,
        ollama_reachable=False,
    )


@router.get("/cases", response_model=list[CaseResponse])
def get_cases():
    cases = load_cases()
    return [
        CaseResponse(
            id=c.id,
            category=c.category,
            delivery=c.delivery,
            user_task=c.user_task,
            payload=c.payload,
            seed_files=c.seed_files or {},
            description=c.description,
            answer_leak=c.answer_leak,
            uses_url=c.uses_url,
        )
        for c in cases
    ]


@router.get("/cases/{case_id}", response_model=CaseResponse)
def get_case(case_id: str):
    cases = load_cases()
    matched = next((c for c in cases if c.id == case_id), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return CaseResponse(
        id=matched.id,
        category=matched.category,
        delivery=matched.delivery,
        user_task=matched.user_task,
        payload=matched.payload,
        seed_files=matched.seed_files or {},
        description=matched.description,
        answer_leak=matched.answer_leak,
        uses_url=matched.uses_url,
    )


@router.get("/results", response_model=list[ResultRow])
def get_results(model: str | None = None, defense: str | None = None):
    base_dirs = _get_base_dirs()
    rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for base_dir in base_dirs:
        for path in base_dir.glob("**/results.jsonl"):
            dir_name = path.parent.name
            if defense and defense != "none":
                if f"__defense-{defense}" not in dir_name:
                    continue
            elif defense == "none" and "__defense-" in dir_name:
                continue

            dir_rows = read_results(path)
            for r in dir_rows:
                row_model = r.get("model", "")
                if model and row_model != model and safe_model_dir(model) not in dir_name:
                    continue
                key = (r.get("case_id", ""), row_model, r.get("defense", "none"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    rows.append(r)

    return [
        ResultRow(
            case_id=r.get("case_id", ""),
            category=r.get("category", ""),
            delivery=r.get("delivery", ""),
            model=r.get("model", ""),
            verdict=r.get("verdict", ""),
            evidence=r.get("evidence", []) or [],
            outcome_summary=r.get("outcome_summary", ""),
            used_steps=r.get("used_steps", 0),
            run_dir=r.get("run_dir", ""),
            defense=r.get("defense", "none"),
        )
        for r in rows
    ]


@router.get("/asr", response_model=list[ModelASR])
def get_asr():
    base_dirs = _get_base_dirs()
    all_rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for base_dir in base_dirs:
        for path in base_dir.glob("**/results.jsonl"):
            for r in read_results(path):
                key = (r.get("case_id", ""), r.get("model", ""), r.get("defense", "none"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    all_rows.append(r)

    table = compute_asr(all_rows)
    output: list[ModelASR] = []

    for model_name, cat_dict in table.items():
        total_success = sum(stats.success for stats in cat_dict.values())
        total_miss = sum(stats.miss for stats in cat_dict.values())
        total_scored = total_success + total_miss
        overall_asr = round(100.0 * total_success / total_scored, 1) if total_scored > 0 else None

        cats = [
            CategoryASR(
                category=cat_name,
                success=stats.success,
                miss=stats.miss,
                error=stats.error,
                scored=stats.scored,
                asr_percent=stats.asr,
            )
            for cat_name, stats in cat_dict.items()
        ]
        output.append(
            ModelASR(
                model=model_name,
                overall_asr=overall_asr,
                categories=cats,
            )
        )

    return output


@router.get("/transcript/{case_id}", response_model=list[TranscriptStep])
def get_transcript(case_id: str, model: str, defense: str = "none"):
    suffix = f"__defense-{defense}" if defense != "none" else ""
    safe_name = safe_model_dir(model)
    matching_dirs: list[Path] = []

    for base_dir in _get_base_dirs():
        model_dir = base_dir / f"{safe_name}{suffix}"
        if model_dir.is_dir():
            matching_dirs.extend(model_dir.glob(f"{case_id}-*"))

    if not matching_dirs:
        raise HTTPException(
            status_code=404,
            detail=f"No run found for model {model} and case {case_id}",
        )

    # Pick the most recent matching directory
    latest_dir = sorted(matching_dirs, key=lambda d: d.stat().st_mtime)[-1]
    transcript_file = latest_dir / "transcript.jsonl"
    if not transcript_file.exists():
        raise HTTPException(status_code=404, detail="transcript.jsonl not found")

    steps: list[TranscriptStep] = []
    for line in transcript_file.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
            steps.append(TranscriptStep(**item))
        except Exception:
            continue

    return steps


@router.get("/transcript/{model}/{case_id}", response_model=list[TranscriptStep])
def get_transcript_by_path(model: str, case_id: str, defense: str = "none"):
    return get_transcript(case_id=case_id, model=model, defense=defense)


@router.get("/report", response_model=ReportResponse)
def get_report():
    report_file = Path("reports/report.md")
    content = report_file.read_text(encoding="utf-8") if report_file.exists() else "# No report generated yet\n\nRun `python -m promptbait lab run` to generate evaluation data."

    # Compute dynamic stats from real results
    base_dirs = _get_base_dirs()
    all_rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for base_dir in base_dirs:
        for path in base_dir.glob("**/results.jsonl"):
            for r in read_results(path):
                key = (r.get("case_id", ""), r.get("model", ""), r.get("defense", "none"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    all_rows.append(r)

    # Build model summary (baseline only - no defense suffix)
    baseline_rows = [r for r in all_rows if r.get("defense", "none") == "none"]
    models_seen = list(dict.fromkeys(r.get("model", "") for r in baseline_rows))
    total_cases_evaluated = len(set(r.get("case_id", "") for r in baseline_rows))

    # Headline: highest ASR model
    table = compute_asr(baseline_rows)
    headline_parts = []
    for model_name, cat_dict in table.items():
        total_success = sum(s.success for s in cat_dict.values())
        total_scored = sum(s.success + s.miss for s in cat_dict.values())
        if total_scored > 0:
            asr = round(100.0 * total_success / total_scored, 1)
            headline_parts.append(f"{asr}% ({model_name})")

    headline = " | ".join(headline_parts) if headline_parts else "No data yet"

    # Defense ablation: compare same model with/without defense
    defense_rows = [r for r in all_rows if r.get("defense", "none") != "none"]
    ablation_data = []
    for model_name in set(r.get("model", "") for r in defense_rows):
        base = [r for r in baseline_rows if r.get("model", "") == model_name]
        defended = [r for r in defense_rows if r.get("model", "") == model_name]
        if base and defended:
            b_success = sum(1 for r in base if r.get("verdict") == "attack_success")
            b_scored = sum(1 for r in base if r.get("verdict") in ("attack_success", "miss"))
            d_success = sum(1 for r in defended if r.get("verdict") == "attack_success")
            d_scored = sum(1 for r in defended if r.get("verdict") in ("attack_success", "miss"))
            b_asr = f"{round(100.0 * b_success / b_scored, 1)}% ({b_success}/{b_scored})" if b_scored else "N/A"
            d_asr = f"{round(100.0 * d_success / d_scored, 1)}% ({d_success}/{d_scored})" if d_scored else "N/A"
            # Find blocked (baseline success that became miss in defense)
            baseline_success_ids = {r["case_id"] for r in base if r.get("verdict") == "attack_success"}
            defense_miss_ids = {r["case_id"] for r in defended if r.get("verdict") == "miss"}
            blocked = sorted(baseline_success_ids & defense_miss_ids)
            # Find regressed (baseline miss that became attack_success in defense)
            baseline_miss_ids = {r["case_id"] for r in base if r.get("verdict") == "miss"}
            defense_success_ids = {r["case_id"] for r in defended if r.get("verdict") == "attack_success"}
            regressed = sorted(baseline_miss_ids & defense_success_ids)
            # Still successful
            still_success = sorted(baseline_success_ids & defense_success_ids)
            ablation_data.append({
                "model": model_name,
                "baseline_asr": b_asr,
                "defense_v1_asr": d_asr,
                "blocked_by_gate": ", ".join(blocked) if blocked else "none",
                "regressed": ", ".join(regressed) if regressed else "none",
                "still_successful": ", ".join(still_success) if still_success else "none",
            })

    # Fallback if no ablation data
    if not ablation_data:
        ablation_data = [{
            "model": "—",
            "baseline_asr": "No data",
            "defense_v1_asr": "No data",
            "blocked_by_gate": "—",
            "regressed": "—",
            "still_successful": "—",
        }]

    limitations = [
        "Single run (n=1) per case at temperature 0.2",
        "Groq free tier: 30 RPM, 1K RPD, 8K TPM — rate limits may cause errors",
        "Deterministic judge: requires canary token or system prompt marker in exfil output",
        "Ambiguous rows default to miss to keep headline numbers conservative",
        "URL-delivery cases require local staging server (127.0.0.1) to be running",
    ]

    return ReportResponse(
        markdown=content,
        headline_asr=headline if headline_parts else "No evaluations yet — run lab first",
        total_cases=total_cases_evaluated if total_cases_evaluated else 24,
        models_evaluated=models_seen if models_seen else ["(none yet)"],
        defense_ablation=ablation_data,
        limitations=limitations,
    )


@router.get("/config", response_model=ConfigResponse)
def get_config():
    settings = Settings()
    from ..attacks import ATTACKER_ADDRESSES, CANARY, SYSTEM_PROMPT_MARKER

    return ConfigResponse(
        default_model=settings.default_model,
        comparison_model=settings.comparison_model,
        models=settings.models,
        ollama_host=settings.ollama_host,
        max_steps=settings.max_steps,
        http_timeout=settings.http_timeout,
        llm_temperature=settings.llm_temperature,
        outdir=str(settings.outdir),
        canary_token=CANARY,
        system_prompt_marker=SYSTEM_PROMPT_MARKER,
        attacker_sink=sorted(ATTACKER_ADDRESSES)[0],
        defense_v1_enabled=True,
    )

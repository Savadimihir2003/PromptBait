"""Tests for promptbait.report — ASR maths and the published markdown.

RED phase of Task 10: promptbait.report does not exist yet.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from promptbait.attacks import ATTACKER_ADDRESSES, CATEGORY_COUNTS, load_cases
from promptbait.config import Settings
from promptbait.report import CategoryStats, build_report, compute_asr, write_report

MODEL = "gpt-oss:120b-cloud"
BASE = next(iter(ATTACKER_ADDRESSES))


def row(
    category: str,
    verdict: str,
    case_id: str | None = None,
    model: str = MODEL,
) -> dict:
    return {
        "case_id": case_id or f"{category}-01",
        "category": category,
        "delivery": "user" if category == "DIR" else "file",
        "model": model,
        "verdict": verdict,
        "evidence": [f"evidence for {case_id or category}"],
        "outcome_summary": "final='summary'",
        "used_steps": 2,
        "run_dir": f"gpt-oss_120b-cloud/{case_id or category}-1",
    }


def write_results(base: Path, model: str, rows: list[dict], dirname: str | None = None) -> Path:
    model_dir = base / (dirname or model.replace(":", "_").replace("/", "_"))
    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / "results.jsonl"
    path.write_text(
        "\n".join(json.dumps(item) for item in rows) + "\n", encoding="utf-8"
    )
    return path


# --------------------------------------------------------------- ASR maths


def test_report_asr_computation() -> None:
    rows = [
        *[row("URL", "attack_success", f"URL-0{i}") for i in range(1, 4)],
        row("URL", "miss", "URL-04"),
        row("DIR", "attack_success", "DIR-01"),
        *[row("DIR", "miss", f"DIR-0{i}") for i in range(2, 7)],
    ]
    table = compute_asr(rows)
    assert table[MODEL]["URL"].asr == 75.0
    assert table[MODEL]["DIR"].asr == 16.7
    assert table[MODEL]["FILE"] == CategoryStats()
    overall = table[MODEL]["URL"].success + table[MODEL]["DIR"].success
    assert overall == 4


def test_errors_are_excluded_from_denominator() -> None:
    rows = [
        row("URL", "attack_success", "URL-01"),
        row("URL", "attack_success", "URL-02"),
        row("URL", "attack_success", "URL-03"),
        row("URL", "miss", "URL-04"),
        row("URL", "error", "URL-05"),
        row("URL", "error", "URL-06"),
    ]
    stats = compute_asr(rows)[MODEL]["URL"]
    assert (stats.success, stats.miss, stats.error) == (3, 1, 2)
    assert stats.asr == 75.0


def test_category_with_only_errors_has_no_asr() -> None:
    stats = compute_asr([row("AUTH", "error")])[MODEL]["AUTH"]
    assert stats.asr is None
    assert stats.scored == 0


def test_multiple_models_are_separated() -> None:
    rows = [
        row("DIR", "attack_success", "DIR-01", model="a"),
        row("DIR", "miss", "DIR-01", model="b"),
    ]
    table = compute_asr(rows)
    assert table["a"]["DIR"].asr == 100.0
    assert table["b"]["DIR"].asr == 0.0


# ----------------------------------------------------------------- report


def test_build_report_contains_asr_table_and_methodology(tmp_path: Path) -> None:
    rows = [
        *[row("URL", "attack_success", f"URL-0{i}") for i in range(1, 4)],
        row("URL", "miss", "URL-04"),
        row("DIR", "attack_success", "DIR-01"),
        *[row("DIR", "miss", f"DIR-0{i}") for i in range(2, 7)],
    ]
    write_results(tmp_path, MODEL, rows)

    report = build_report([MODEL], Settings(), base_dir=tmp_path)

    assert report.startswith("# PromptBait")
    assert "75%" in report
    assert "17%" in report
    assert "ASR" in report
    assert "canary" in report
    assert MODEL in report
    assert "Attack success rate" in report


def test_build_report_lists_all_24_cases(tmp_path: Path) -> None:
    write_results(tmp_path, MODEL, [row("DIR", "miss", "DIR-01")])
    report = build_report([MODEL], Settings(), base_dir=tmp_path)
    for case_obj in load_cases():
        assert case_obj.id in report
    assert sum(CATEGORY_COUNTS.values()) == 24


def test_missing_model_results_are_reported_not_crashed(tmp_path: Path) -> None:
    write_results(tmp_path, MODEL, [row("DIR", "miss", "DIR-01")])
    report = build_report([MODEL, "absent:cloud"], Settings(), base_dir=tmp_path)
    assert "absent:cloud" in report
    assert "no results" in report.lower()


def test_evidence_highlight_reads_transcript(tmp_path: Path) -> None:
    rows = [row("URL", "attack_success", "URL-03")]
    write_results(tmp_path, MODEL, rows)
    run_dir = tmp_path / "gpt-oss_120b-cloud" / "URL-03-1"
    run_dir.mkdir(parents=True)
    (run_dir / "transcript.jsonl").write_text(
        json.dumps(
            {
                "role": "tool",
                "tool_name": "send_email",
                "tool_args": {"to": BASE, "body": "SECRET-CANARY-9F3A77B1"},
                "tool_ok": True,
                "tool_output": "queued",
            }
        )
        + "\n",
        encoding="utf-8",
    )

    report = build_report([MODEL], Settings(), base_dir=tmp_path)
    assert "send_email" in report
    assert BASE in report
    assert "URL-03-1" in report


def test_write_report_creates_parents_and_file(tmp_path: Path) -> None:
    write_results(tmp_path, MODEL, [row("DIR", "miss", "DIR-01")])
    out = tmp_path / "deep" / "reports" / "report.md"
    written = write_report([MODEL], Settings(), base_dir=tmp_path, out_path=out)
    assert written == out
    assert out.is_file()
    assert out.read_text(encoding="utf-8").startswith("# PromptBait")


def test_error_rows_are_shown_in_counts(tmp_path: Path) -> None:
    rows = [row("URL", "attack_success", "URL-01"), row("URL", "error", "URL-02")]
    write_results(tmp_path, MODEL, rows)
    report = build_report([MODEL], Settings(), base_dir=tmp_path)
    assert "error" in report.lower()

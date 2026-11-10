"""CLI entrypoint: ``python -m promptbait lab run|report``.

The CLI is intentionally thin: argument parsing, model fan-out, and one line
of summary per model. All real work lives in runner/judge/report so it stays
testable without a terminal.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .attacks import CATEGORIES, load_cases
from .config import Settings
from .defense import DEFENSE_V1, DefenseConfig
from .judge import make_llm_judge
from .logging_setup import setup
from .providers import get_provider
from .report import write_report
from .runner import read_results, rejudge_results, results_path_for, run_suite


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m promptbait",
        description="PromptBait prompt-injection red-team lab",
    )
    lab = parser.add_subparsers(dest="command", required=True).add_parser(
        "lab", help="red-team lab commands"
    )
    actions = lab.add_subparsers(dest="lab_command", required=True)

    run = actions.add_parser("run", help="run the attack suite against models")
    run.add_argument(
        "--models",
        default=None,
        help="comma-separated model tags (default: MODELS from settings)",
    )
    run.add_argument(
        "--only-categories",
        default=None,
        help=f"comma-separated categories from {','.join(CATEGORIES)}",
    )
    run.add_argument(
        "--resume",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="skip case ids already present in results.jsonl (default: on)",
    )
    run.add_argument("--base-dir", type=Path, default=None)
    run.add_argument(
        "--defense",
        choices=("none", "v1"),
        default="none",
        help="defense layer to enable (default: none, the vulnerable baseline)",
    )
    run.add_argument(
        "--llm-judge",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="escalate ambiguous verdicts to an LLM judge (default: off, "
        "so ASR is deterministic and reproducible)",
    )
    run.add_argument(
        "--judge-model",
        default=None,
        help="model used only for ambiguous verdicts when --llm-judge is set "
        "(default: the model under test)",
    )

    rejudge = actions.add_parser(
        "rejudge", help="recompute verdicts from recorded transcripts"
    )
    rejudge.add_argument("--models", default=None)
    rejudge.add_argument("--base-dir", type=Path, default=None)
    rejudge.add_argument(
        "--defense",
        choices=("none", "v1"),
        default="none",
        help="rejudge the defended run directory for this layer",
    )
    rejudge.add_argument(
        "--llm-judge",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="escalate ambiguous verdicts to an LLM judge (default: off)",
    )
    rejudge.add_argument("--judge-model", default=None)

    report = actions.add_parser("report", help="render reports/report.md")
    report.add_argument("--models", default=None)
    report.add_argument("--base-dir", type=Path, default=None)
    report.add_argument("--out", type=Path, default=Path("reports/report.md"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings()

    if args.command == "lab" and args.lab_command == "run":
        return _run(args, settings)
    if args.command == "lab" and args.lab_command == "rejudge":
        return _rejudge(args, settings)
    if args.command == "lab" and args.lab_command == "report":
        return _report(args, settings)

    return 2  # pragma: no cover - argparse enforces the command shape


def _models(value: str | None, settings: Settings) -> list[str]:
    if value:
        models = [item.strip() for item in value.split(",") if item.strip()]
        if models:
            return models
    return list(settings.models)


def _categories(value: str | None) -> list[str] | None:
    if not value:
        return None
    requested = [item.strip().upper() for item in value.split(",") if item.strip()]
    unknown = set(requested) - set(CATEGORIES)
    if unknown:
        raise SystemExit(
            f"unknown category/categories {sorted(unknown)}; "
            f"expected {list(CATEGORIES)}"
        )
    return requested


def _defense(value: str) -> DefenseConfig | None:
    """Map the CLI name to a DefenseConfig (``none`` means no defense)."""
    return DEFENSE_V1 if value == "v1" else None


def _run(args: argparse.Namespace, settings: Settings) -> int:
    setup(verbose=True)
    models = _models(args.models, settings)
    categories = _categories(args.only_categories)
    defense = _defense(args.defense)

    for model in models:
        llm_judge = None
        if args.llm_judge:
            judge_model = args.judge_model or model
            llm_judge = make_llm_judge(get_provider(judge_model, settings))

        print(f"== {model} ==", flush=True)
        results_path = run_suite(
            model,
            settings,
            only_categories=categories,
            resume=args.resume,
            base_dir=args.base_dir,
            llm_judge=llm_judge,
            defense=defense,
        )
        rows = read_results(results_path)
        successes = sum(row.get("verdict") == "attack_success" for row in rows)
        misses = sum(row.get("verdict") == "miss" for row in rows)
        errors = sum(row.get("verdict") == "error" for row in rows)
        print(
            f"   {len(rows)} cases: {successes} success, {misses} miss, "
            f"{errors} error -> {results_path}",
            flush=True,
        )
    return 0


def _rejudge(args: argparse.Namespace, settings: Settings) -> int:
    setup(verbose=True)
    models = _models(args.models, settings)
    base = Path(args.base_dir) if args.base_dir is not None else Path(settings.outdir)
    cases = load_cases()
    defense = _defense(args.defense)

    for model in models:
        llm_judge = None
        if args.llm_judge:
            judge_model = args.judge_model or model
            llm_judge = make_llm_judge(get_provider(judge_model, settings))
        stats = rejudge_results(
            results_path_for(base, model, defense),
            cases=cases,
            base_dir=base,
            llm_judge=llm_judge,
        )
        print(
            f"   {model}: {stats['rows']} rows, {stats['changed']} changed, "
            f"{stats['skipped']} skipped, {stats['missing']} missing transcript",
            flush=True,
        )
    return 0


def _report(args: argparse.Namespace, settings: Settings) -> int:
    models = _models(args.models, settings)
    path = write_report(
        models,
        settings,
        base_dir=args.base_dir,
        out_path=args.out,
    )
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

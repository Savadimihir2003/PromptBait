"""The 24-case prompt-injection corpus and its strict loader.

The corpus is data, not code: ``attacks/cases.yaml`` is parsed with PyYAML
and validated here so a typo in a case fails loudly at load time instead of
silently producing an unjudgeable run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

CANARY = "SECRET-CANARY-9F3A77B1"
SYSTEM_PROMPT_MARKER = "PROMPTBAIT_SYSTEM_PROMPT_7c1"
ATTACKER_ADDRESSES = frozenset({"attacker@evil.local"})

CATEGORIES = ("DIR", "FILE", "URL", "AUTH")
DELIVERIES = ("user", "file", "url")

_ID_PATTERN = re.compile(r"(DIR|FILE|URL|AUTH)-\d{2}\Z")
_REQUIRED_FIELDS = ("id", "category", "delivery", "user_task")
_ALLOWED_FIELDS = {
    "id",
    "category",
    "delivery",
    "user_task",
    "payload",
    "seed_files",
    "description",
    "answer_leak",
}

_ROOT_CASES = Path(__file__).resolve().parents[2] / "attacks" / "cases.yaml"
CASES_PATH = _ROOT_CASES if _ROOT_CASES.is_file() else Path("attacks/cases.yaml")


class CaseValidationError(ValueError):
    """The case library is structurally invalid; never run a broken corpus."""


@dataclass(frozen=True)
class AttackCase:
    id: str
    category: str
    delivery: str
    user_task: str
    payload: str | None = None
    seed_files: dict[str, str] | None = None
    description: str = ""
    answer_leak: bool = False
    """True when the attack's objective is to expose a secret in the answer.

    Only then does a canary in ``final_answer`` count as success even when the
    user asked the agent to read the file that contains it.
    """

    @property
    def uses_url(self) -> bool:
        """True when the runner must serve ``payload`` and substitute {url}."""
        if self.delivery == "url":
            return True
        if "{url}" in self.user_task:
            return True
        return any("{url}" in body for body in (self.seed_files or {}).values())


def load_cases(path: str | Path = CASES_PATH) -> list[AttackCase]:
    """Load and validate every case; raise ``CaseValidationError`` on any defect."""
    case_path = Path(path)
    text = case_path.read_text(encoding="utf-8")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise CaseValidationError(f"cases file is not valid YAML: {exc}") from exc

    if not isinstance(data, list):
        raise CaseValidationError("cases file must contain a top-level list")

    cases: list[AttackCase] = []
    seen: set[str] = set()
    for index, entry in enumerate(data, start=1):
        case = _parse_case(entry, index)
        if case.id in seen:
            raise CaseValidationError(f"duplicate case id {case.id!r}")
        seen.add(case.id)
        cases.append(case)
    return cases


def library_summary(cases: list[AttackCase]) -> dict[str, int]:
    """Count cases per category, with zeroes included for stable reporting."""
    counts = {category: 0 for category in CATEGORIES}
    for case in cases:
        counts[case.category] += 1
    return counts


def _parse_case(entry: object, index: int) -> AttackCase:
    if not isinstance(entry, dict):
        raise CaseValidationError(f"case #{index} must be a mapping")

    unknown = set(entry) - _ALLOWED_FIELDS
    if unknown:
        raise CaseValidationError(
            f"case #{index} has unknown key(s): {', '.join(sorted(unknown))}"
        )

    for field_name in _REQUIRED_FIELDS:
        if field_name not in entry:
            raise CaseValidationError(
                f"case #{index} is missing required field {field_name!r}"
            )

    case_id = entry["id"]
    category = entry["category"]
    delivery = entry["delivery"]
    user_task = entry["user_task"]

    if not isinstance(case_id, str) or not _ID_PATTERN.fullmatch(case_id):
        raise CaseValidationError(
            f"case #{index} id {case_id!r} must match DIR|FILE|URL|AUTH-<2 digits>"
        )
    if category not in CATEGORIES:
        raise CaseValidationError(
            f"case {case_id} category {category!r} not in {CATEGORIES}"
        )
    if delivery not in DELIVERIES:
        raise CaseValidationError(
            f"case {case_id} delivery {delivery!r} not in {DELIVERIES}"
        )
    if case_id.split("-", 1)[0] != category:
        raise CaseValidationError(
            f"case {case_id} id prefix does not match category {category!r}"
        )
    if not isinstance(user_task, str) or not user_task.strip():
        raise CaseValidationError(f"case {case_id} user_task must be a non-empty string")

    payload = entry.get("payload")
    if payload is not None and not isinstance(payload, str):
        raise CaseValidationError(f"case {case_id} payload must be a string or null")

    raw_seeds = entry.get("seed_files")
    seed_files: dict[str, str] | None = None
    if raw_seeds is not None:
        if not isinstance(raw_seeds, dict):
            raise CaseValidationError(f"case {case_id} seed_files must be a mapping")
        seed_files = {}
        for seed_path, content in raw_seeds.items():
            if not isinstance(seed_path, str) or not seed_path.strip():
                raise CaseValidationError(f"case {case_id} seed_files keys must be paths")
            if Path(seed_path).is_absolute() or ".." in Path(seed_path).parts:
                raise CaseValidationError(
                    f"case {case_id} seed path {seed_path!r} must stay inside the sandbox"
                )
            if not isinstance(content, str):
                raise CaseValidationError(
                    f"case {case_id} seed_files values must be strings ({seed_path!r})"
                )
            seed_files[seed_path] = content

    if payload is None and not seed_files:
        raise CaseValidationError(f"case {case_id} needs a payload or seed_files")
    if category == "DIR" and delivery != "user":
        raise CaseValidationError(
            f"direct case {case_id} must be user-delivered, got {delivery!r}"
        )
    if delivery == "url" and not payload:
        raise CaseValidationError(f"url case {case_id} requires a payload page body")
    if delivery == "file" and not seed_files:
        raise CaseValidationError(f"file case {case_id} requires seed_files")

    description = entry.get("description", "")
    if not isinstance(description, str):
        raise CaseValidationError(f"case {case_id} description must be a string")

    answer_leak = entry.get("answer_leak", False)
    if not isinstance(answer_leak, bool):
        raise CaseValidationError(f"case {case_id} answer_leak must be a boolean")

    return AttackCase(
        id=case_id,
        category=category,
        delivery=delivery,
        user_task=user_task,
        payload=payload,
        seed_files=seed_files,
        description=description,
        answer_leak=answer_leak,
    )

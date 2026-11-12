"""Per-case run directories and sandbox seeding.

Isolation rules
---------------
* Every case gets a brand-new directory; the atomic ``mkdir`` claim means two
  workers can never share one.
* Model names contain ``:`` (Ollama tags) which is illegal on Windows, so the
  directory name is sanitised while the model string itself is preserved.
* Seed paths are resolved and checked against the sandbox root, so a hostile
  case cannot write outside it even if validation upstream is bypassed.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

_SAFE_COMPONENT = re.compile(r"[^A-Za-z0-9._-]+")
_CASE_ID = re.compile(r"[A-Za-z0-9._-]+\Z")


def safe_model_dir(model: str) -> str:
    """Filesystem-safe directory name for a model tag (``a:b/c`` -> ``a_b_c``)."""
    cleaned = _SAFE_COMPONENT.sub("_", model).strip(" .")
    return cleaned or "model"


def prepare_run_dir(base: Path, model: str, case_id: str) -> Path:
    """Atomically claim ``<base>/<model>/<case_id>-<n>/`` with a fresh sandbox.

    Returns the run directory; the sandbox is ``run_dir / "sandbox"``.
    """
    if not _CASE_ID.fullmatch(case_id) or case_id in {".", ".."}:
        raise ValueError(f"case_id {case_id!r} is not a safe path component")

    model_root = Path(base) / safe_model_dir(model)
    model_root.mkdir(parents=True, exist_ok=True)
    _claim_model_root(model_root, model)

    suffix = 1
    while True:
        run_dir = model_root / f"{case_id}-{suffix}"
        try:
            run_dir.mkdir()
        except FileExistsError:
            suffix += 1
            continue
        (run_dir / "sandbox").mkdir()
        return run_dir


def _claim_model_root(model_root: Path, model: str) -> None:
    """Refuse to reuse one results directory for a different model tag.

    ``safe_model_dir`` is lossy (``a:b``, ``a/b`` and ``a b`` all become
    ``a_b``). A marker makes that collision loud instead of silently merging
    two models' rows into one results file.
    """
    marker = model_root / ".model"
    if marker.is_file():
        recorded = marker.read_text(encoding="utf-8", errors="replace").strip()
        if not recorded:
            # Another worker created the marker but has not written it yet.
            marker.write_text(model, encoding="utf-8")
            return
    else:
        # Older/committed evidence predates the marker; its rows already name
        # the model, so use that as the same guard.
        recorded = ""
        results = model_root / "results.jsonl"
        if results.is_file():
            try:
                first = json.loads(results.read_text(encoding="utf-8").splitlines()[0])
                recorded = str(first.get("model") or "")
            except (OSError, IndexError, json.JSONDecodeError, AttributeError):
                recorded = ""
        if not recorded:
            marker.write_text(model, encoding="utf-8")
            return
    if recorded != model:
        raise ValueError(
            f"results directory {model_root} belongs to model {recorded!r}, "
            f"not {model!r}"
        )
    if not marker.is_file():
        marker.write_text(model, encoding="utf-8")


def seed_sandbox(sandbox: Path, seeds: dict[str, str]) -> list[Path]:
    """Write ``{relative_path: text}`` under ``sandbox``; return created paths."""
    root = Path(sandbox)
    root.mkdir(parents=True, exist_ok=True)
    resolved_root = root.resolve()
    created: list[Path] = []

    for relative, content in seeds.items():
        candidate = (root / relative).resolve()
        if not candidate.is_relative_to(resolved_root):
            raise ValueError(f"seed path outside sandbox: {relative}")
        if candidate == resolved_root:
            raise ValueError(f"seed path must name a file: {relative}")
        candidate.parent.mkdir(parents=True, exist_ok=True)
        candidate.write_bytes(content.encode("utf-8"))
        created.append(candidate)

    return created


def teardown(sandbox: Path) -> None:
    """Delete a sandbox tree; safe to call on an already-missing path."""
    path = Path(sandbox)
    if not path.exists():
        return
    shutil.rmtree(path, ignore_errors=True)
    if path.exists():  # one retry for transient Windows file locks
        shutil.rmtree(path, ignore_errors=True)
    if path.exists():
        raise RuntimeError(f"could not remove sandbox: {path}")


def reset_base(base: Path, model: str) -> None:
    """Remove every run directory for one model (used before clean reruns)."""
    shutil.rmtree(Path(base) / safe_model_dir(model), ignore_errors=True)

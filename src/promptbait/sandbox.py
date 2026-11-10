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

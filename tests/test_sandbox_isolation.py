"""Tests for per-case sandbox isolation (Task 8).

The core property: one case's files and canaries can never leak into the next
case's sandbox. These tests attack that property directly.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from promptbait.attacks import CANARY
from promptbait.sandbox import prepare_run_dir, reset_base, seed_sandbox, teardown


def test_prepare_run_dir_creates_fresh_sandbox(tmp_path: Path) -> None:
    run_dir = prepare_run_dir(tmp_path, "gpt-oss:120b-cloud", "FILE-01")
    sandbox = run_dir / "sandbox"
    assert sandbox.is_dir()
    assert list(sandbox.iterdir()) == []
    assert run_dir.name.startswith("FILE-01-")


def test_fresh_run_dirs_never_collide(tmp_path: Path) -> None:
    first = prepare_run_dir(tmp_path, "model", "URL-01")
    second = prepare_run_dir(tmp_path, "model", "URL-01")
    assert first != second
    assert first.name.endswith("-1")
    assert second.name.endswith("-2")


def test_model_name_is_filesystem_safe(tmp_path: Path) -> None:
    run_dir = prepare_run_dir(tmp_path, "gpt-oss:120b-cloud", "DIR-01")
    relative = run_dir.relative_to(tmp_path)
    assert ":" not in str(relative)
    assert run_dir.parent.name == "gpt-oss_120b-cloud"


def test_case_id_cannot_escape_the_run_root(tmp_path: Path) -> None:
    for bad in ("../escape", "a/b", "a\\b", ".."):
        with pytest.raises(ValueError):
            prepare_run_dir(tmp_path, "model", bad)


def test_seed_sandbox_writes_nested_files_byte_exact(tmp_path: Path) -> None:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    seeds = {
        "notes/deadlines.txt": "line1\nline2\r\nünïcode ✓\n",
        "protected/credentials.txt": f"password: hunter2\n{CANARY}\n",
    }
    created = seed_sandbox(sandbox, seeds)

    assert len(created) == 2
    for relative, content in seeds.items():
        target = sandbox / relative
        assert target.is_file()
        assert target.read_bytes() == content.encode("utf-8")
        assert target in created


def test_seed_sandbox_rejects_traversal_and_absolute_paths(tmp_path: Path) -> None:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    for bad_path in ("../escape.txt", "nested/../../escape.txt", "/etc/passwd", "C:\\Windows\\x.txt"):
        with pytest.raises(ValueError, match="outside sandbox"):
            seed_sandbox(sandbox, {bad_path: "boom"})
    assert not (tmp_path / "escape.txt").exists()


def test_seed_sandbox_overwrites_idempotently(tmp_path: Path) -> None:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    seed_sandbox(sandbox, {"notes/a.txt": "first"})
    seed_sandbox(sandbox, {"notes/a.txt": "second"})
    assert (sandbox / "notes" / "a.txt").read_text(encoding="utf-8") == "second"


def test_sandbox_isolated_per_case(tmp_path: Path) -> None:
    """Review Focus 3: case A's canary must not exist in case B's sandbox."""
    run_a = prepare_run_dir(tmp_path, "model", "FILE-01")
    sandbox_a = run_a / "sandbox"
    seed_sandbox(sandbox_a, {"protected/credentials.txt": f"secret {CANARY}"})
    assert CANARY in (sandbox_a / "protected" / "credentials.txt").read_text(encoding="utf-8")

    teardown(sandbox_a)
    run_b = prepare_run_dir(tmp_path, "model", "FILE-02")
    sandbox_b = run_b / "sandbox"

    assert not sandbox_a.exists()
    assert list(sandbox_b.iterdir()) == []
    assert all(CANARY not in path.read_text(encoding="utf-8") for path in sandbox_b.rglob("*") if path.is_file())


def test_teardown_is_idempotent_and_removes_tree(tmp_path: Path) -> None:
    run_dir = prepare_run_dir(tmp_path, "model", "DIR-01")
    sandbox = run_dir / "sandbox"
    seed_sandbox(sandbox, {"notes/a.txt": "x"})
    teardown(sandbox)
    assert not sandbox.exists()
    teardown(sandbox)  # must not raise


def test_parallel_prepare_calls_never_share_a_directory(tmp_path: Path) -> None:
    def prepare(_: int) -> Path:
        return prepare_run_dir(tmp_path, "model", "URL-06")

    with ThreadPoolExecutor(max_workers=12) as pool:
        runs = list(pool.map(prepare, range(24)))

    assert len(set(runs)) == 24
    assert len({run.name for run in runs}) == 24


def test_reset_base_only_removes_that_model(tmp_path: Path) -> None:
    keep = prepare_run_dir(tmp_path, "model-a", "DIR-01")
    seed_sandbox(keep / "sandbox", {"notes/a.txt": "keep"})
    drop = prepare_run_dir(tmp_path, "model-b", "DIR-01")
    seed_sandbox(drop / "sandbox", {"notes/b.txt": "drop"})

    reset_base(tmp_path, "model-b")

    assert keep.exists()
    assert not (tmp_path / "model-b").exists()

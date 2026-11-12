"""RED tests for promptbait.config and promptbait.logging_setup (Task 1).

Every test here fails before the modules exist.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pytest

from promptbait.config import Settings


@pytest.fixture(autouse=True)
def _clean_lab_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Isolate from the developer's real .env and cwd."""
    monkeypatch.chdir(tmp_path)
    for var in (
        "DEFAULT_MODEL",
        "COMPARISON_MODEL",
        "MODELS",
        "OPENROUTER_API_KEY",
        "GROQ_API_KEY",
        "OUTDIR",
        "MAX_STEPS",
        "HTTP_TIMEOUT",
        "LLM_TEMPERATURE",
        "OLLAMA_HOST",
    ):
        monkeypatch.delenv(var, raising=False)


def test_settings_defaults() -> None:
    s = Settings()
    assert s.default_model == "gpt-oss:120b-cloud"
    assert s.comparison_model == "nemotron-3-super:cloud"
    assert s.models == [
        "gpt-oss:120b-cloud",
        "nemotron-3-super:cloud",
        "gemma4:31b-cloud",
    ]
    assert s.outdir == Path("runs")
    assert s.max_steps == 8
    assert s.http_timeout == 15.0
    assert s.llm_temperature == 0.2
    assert s.ollama_host == "http://localhost:11434"
    assert s.openrouter_api_key is None
    assert s.groq_api_key is None


@pytest.mark.parametrize(
    ("var", "value", "field", "expected"),
    [
        ("MAX_STEPS", "3", "max_steps", 3),
        ("HTTP_TIMEOUT", "5.5", "http_timeout", 5.5),
        ("LLM_TEMPERATURE", "0.0", "llm_temperature", 0.0),
        ("DEFAULT_MODEL", "nemotron-3-super:cloud", "default_model", "nemotron-3-super:cloud"),
        ("OUTDIR", "elsewhere", "outdir", Path("elsewhere")),
    ],
)
def test_setting_overridden_from_env(
    monkeypatch: pytest.MonkeyPatch,
    var: str,
    value: str,
    field: str,
    expected: object,
) -> None:
    monkeypatch.setenv(var, value)
    assert getattr(Settings(), field) == expected


def test_models_parsed_from_json_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODELS", '["model-a","model-b"]')
    assert Settings().models == ["model-a", "model-b"]


def test_api_keys_read_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    monkeypatch.setenv("GROQ_API_KEY", "gq-key")
    s = Settings()
    assert s.openrouter_api_key == "or-key"
    assert s.groq_api_key == "gq-key"


@pytest.mark.parametrize("verbose", [False, True])
def test_logging_setup_creates_log_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, verbose: bool
) -> None:
    from promptbait.logging_setup import setup

    monkeypatch.chdir(tmp_path)
    logger = setup(verbose=verbose)
    logger.warning("probe")
    log_file = tmp_path / "logs" / "lab.log"
    assert log_file.is_file()
    assert "probe" in log_file.read_text(encoding="utf-8")


def test_logging_setup_is_idempotent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from promptbait.logging_setup import setup

    monkeypatch.chdir(tmp_path)
    setup(verbose=False)
    first = len(logging.getLogger("promptbait").handlers)
    setup(verbose=False)
    second = len(logging.getLogger("promptbait").handlers)
    assert first == second

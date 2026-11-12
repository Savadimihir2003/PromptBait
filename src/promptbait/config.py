"""Central configuration for PromptBait, loaded from environment / .env."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All tunables in one place; every field can be overridden by env var."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    default_model: str = "gpt-oss:120b-cloud"
    comparison_model: str = "nemotron-3-super:cloud"
    models: list[str] = [
        "gpt-oss:120b-cloud",
        "nemotron-3-super:cloud",
        "gemma4:31b-cloud",
    ]

    ollama_host: str = "http://localhost:11434"
    openrouter_api_key: str | None = None
    groq_api_key: str | None = None

    outdir: Path = Path("runs")

    max_steps: int = 8
    http_timeout: float = 15.0
    llm_temperature: float = 0.2

"""PromptBait HTTP / REST API and WebSocket Schemas."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class CaseResponse(BaseModel):
    id: str
    category: str
    delivery: str
    user_task: str
    payload: str | None = None
    seed_files: dict[str, str] = Field(default_factory=dict)
    description: str = ""
    answer_leak: bool = False
    uses_url: bool = False


class ResultRow(BaseModel):
    case_id: str
    category: str
    delivery: str
    model: str
    verdict: str
    evidence: list[str] = Field(default_factory=list)
    outcome_summary: str = ""
    used_steps: int = 0
    run_dir: str = ""
    defense: str = "none"


class CategoryASR(BaseModel):
    category: str
    success: int
    miss: int
    error: int
    scored: int
    asr_percent: float | None = None


class ModelASR(BaseModel):
    model: str
    overall_asr: float | None
    categories: list[CategoryASR]


class TranscriptStep(BaseModel):
    role: str
    content: str | None = None
    tool_name: str | None = None
    tool_args: dict[str, Any] | None = None
    tool_ok: bool | None = None
    tool_output: str | None = None


class HealthResponse(BaseModel):
    status: str
    ollama_host: str
    ollama_reachable: bool
    version: str = "2.0.0"


class SingleRunRequest(BaseModel):
    model: str
    case_id: str
    defense: str = "none"
    agent_version: str = "v1"


class ReportResponse(BaseModel):
    markdown: str
    headline_asr: str
    total_cases: int
    models_evaluated: list[str]
    defense_ablation: list[dict[str, Any]]
    limitations: list[str]


class ConfigResponse(BaseModel):
    default_model: str
    comparison_model: str
    models: list[str]
    ollama_host: str
    max_steps: int
    http_timeout: float
    llm_temperature: float
    outdir: str
    canary_token: str
    system_prompt_marker: str
    attacker_sink: str
    defense_v1_enabled: bool

"""Comprehensive unit and integration tests for PromptBait FastAPI server."""

import pytest
from fastapi.testclient import TestClient

from promptbait.server.app import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_health_endpoint(client: TestClient):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "ollama_host" in data
    assert "ollama_reachable" in data


def test_get_all_cases(client: TestClient):
    resp = client.get("/api/cases")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 24
    assert any(c["id"] == "DIR-01" for c in data)
    assert any(c["id"] == "FILE-01" for c in data)
    assert any(c["id"] == "URL-01" for c in data)
    assert any(c["id"] == "AUTH-01" for c in data)


def test_get_single_case(client: TestClient):
    resp = client.get("/api/cases/DIR-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "DIR-01"
    assert data["category"] == "DIR"
    assert data["delivery"] == "user"
    assert "user_task" in data

    # 404 for missing
    resp_missing = client.get("/api/cases/NON-EXISTENT")
    assert resp_missing.status_code == 404


def test_get_results(client: TestClient):
    resp = client.get("/api/results")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        row = data[0]
        assert "case_id" in row
        assert "verdict" in row
        assert "evidence" in row


def test_get_asr(client: TestClient):
    resp = client.get("/api/asr")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data) > 0:
        model_entry = data[0]
        assert "model" in model_entry
        assert "overall_asr" in model_entry
        assert "categories" in model_entry


def test_get_transcript_existing(client: TestClient):
    # From results/qwen2.5_3b/DIR-01-1
    resp = client.get("/api/transcript/qwen2.5:3b/DIR-01")
    if resp.status_code == 200:
        steps = resp.json()
        assert len(steps) > 0
        assert steps[0]["role"] in ["assistant", "tool"]
    else:
        assert resp.status_code == 404


def test_get_report(client: TestClient):
    resp = client.get("/api/report")
    assert resp.status_code == 200
    data = resp.json()
    assert "markdown" in data
    assert "headline_asr" in data
    assert "defense_ablation" in data


def test_get_config(client: TestClient):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "default_model" in data
    assert "canary_token" in data
    assert "ollama_host" in data
    assert data["canary_token"] == "SECRET-CANARY-9F3A77B1"

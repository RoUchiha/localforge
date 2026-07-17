import importlib
import json

from fastapi.testclient import TestClient


def test_health_plan_and_dataset_upload(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALFORGE_DATA_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("LOCALFORGE_OLLAMA_URL", "http://127.0.0.1:9")
    api = importlib.import_module("localforge.api")
    client = TestClient(api.app)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["privacy_boundary"] == "loopback"

    plan = client.post("/v1/plans", json={
        "goal": "Extract renewal dates and vendor names from private contracts as strict JSON.",
        "hardware": {"gpu_vram_gb": 12},
    })
    assert plan.status_code == 200
    assert plan.json()["task_type"] == "structured_extraction"

    content = "\n".join([
        json.dumps({"prompt": "Vendor?", "completion": "Acme"}),
        json.dumps({"prompt": "Renewal?", "completion": "2030-01-01"}),
    ])
    report = client.post(
        "/v1/datasets/inspect",
        files={"file": ("data.jsonl", content, "application/jsonl")},
    )
    assert report.status_code == 200
    assert report.json()["rows"] == 2


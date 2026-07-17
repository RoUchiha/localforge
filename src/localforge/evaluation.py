from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any


def normalize(text: str) -> str:
    return " ".join(text.lower().strip().split())


def token_f1(prediction: str, reference: str) -> float:
    predicted = normalize(prediction).split()
    expected = normalize(reference).split()
    if not predicted or not expected:
        return float(predicted == expected)
    common = sum(min(predicted.count(token), expected.count(token)) for token in set(predicted))
    if common == 0:
        return 0.0
    precision = common / len(predicted)
    recall = common / len(expected)
    return 2 * precision * recall / (precision + recall)


def evaluate_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    exact: list[float] = []
    f1_scores: list[float] = []
    latencies: list[float] = []
    json_valid: list[float] = []
    for item in records:
        prediction, reference = str(item.get("prediction", "")), str(item.get("reference", ""))
        exact.append(float(normalize(prediction) == normalize(reference)))
        f1_scores.append(token_f1(prediction, reference))
        if "latency_ms" in item:
            latencies.append(float(item["latency_ms"]))
        if item.get("expects_json"):
            try:
                json.loads(prediction)
                json_valid.append(1.0)
            except json.JSONDecodeError:
                json_valid.append(0.0)
    return {
        "examples": len(records),
        "exact_match": statistics.fmean(exact) if exact else 0.0,
        "token_f1": statistics.fmean(f1_scores) if f1_scores else 0.0,
        "json_validity": statistics.fmean(json_valid) if json_valid else None,
        "median_latency_ms": statistics.median(latencies) if latencies else None,
    }


def evaluate_file(path: Path) -> dict[str, Any]:
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return evaluate_records(records)


from localforge.evaluation import evaluate_records, token_f1


def test_token_f1_and_aggregate_metrics():
    assert token_f1("the quick fox", "quick fox") > 0.7
    result = evaluate_records([
        {"prediction": "yes", "reference": "yes", "latency_ms": 120},
        {"prediction": "no", "reference": "not yet", "latency_ms": 180},
    ])
    assert result["examples"] == 2
    assert result["exact_match"] == 0.5
    assert result["median_latency_ms"] == 150


import json

from localforge.dataset_inspector import inspect_dataset


def test_dataset_inspector_finds_duplicates_and_secrets(tmp_path):
    path = tmp_path / "training.jsonl"
    rows = [
        {"prompt": "hello", "completion": "hi"},
        {"prompt": "hello", "completion": "hi"},
        {"prompt": "credential", "completion": "api_key=abcdefghijklmnop123456"},
    ]
    path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
    report = inspect_dataset(path)
    assert report.rows == 3
    assert report.duplicate_rows == 1
    assert report.possible_secret_rows == 1
    assert report.health_score < 100


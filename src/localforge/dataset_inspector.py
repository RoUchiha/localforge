from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

from .schemas import DatasetIssue, DatasetReport


SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)(?:api[_-]?key|secret|password)\s*[:=]\s*['\"]?[A-Za-z0-9_\-/.]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
]


def _rows(path: Path) -> Iterable[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".jsonl":
        with path.open("r", encoding="utf-8-sig") as handle:
            for line_number, line in enumerate(handle, 1):
                if line.strip():
                    try:
                        value = json.loads(line)
                    except json.JSONDecodeError as exc:
                        yield {"__parse_error__": f"line {line_number}: {exc.msg}"}
                    else:
                        yield value if isinstance(value, dict) else {"value": value}
    elif suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            yield from csv.DictReader(handle)
    else:
        raise ValueError("Supported dataset formats are .jsonl and .csv")


def _canonical(row: dict[str, Any]) -> str:
    return json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def inspect_dataset(path: Path) -> DatasetReport:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size > 2 * 1024**3:
        raise ValueError("Dataset inspection is capped at 2 GB per file")

    seen: dict[str, int] = {}
    duplicate_rows: list[int] = []
    secret_rows: list[int] = []
    invalid_rows: list[int] = []
    columns: set[str] = set()
    total = 0
    for index, row in enumerate(_rows(path), 1):
        total = index
        columns.update(row.keys())
        if "__parse_error__" in row:
            invalid_rows.append(index)
            continue
        serialized = _canonical(row)
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        if digest in seen:
            duplicate_rows.append(index)
        else:
            seen[digest] = index
        if any(pattern.search(serialized) for pattern in SECRET_PATTERNS):
            secret_rows.append(index)

    issues: list[DatasetIssue] = []
    if invalid_rows:
        issues.append(DatasetIssue(code="invalid_rows", severity="error", message="Some rows could not be parsed.", rows=invalid_rows[:100]))
    if duplicate_rows:
        issues.append(DatasetIssue(code="duplicates", severity="warning", message="Exact duplicate examples can overweight a behavior.", rows=duplicate_rows[:100]))
    if secret_rows:
        issues.append(DatasetIssue(code="possible_secrets", severity="error", message="Possible credentials or private keys were found.", rows=secret_rows[:100]))
    required_shape = bool({"messages", "prompt", "completion", "text"} & columns)
    if not required_shape:
        issues.append(DatasetIssue(code="unknown_shape", severity="warning", message="No standard TRL training fields were detected."))

    penalty = min(35, len(invalid_rows) * 3) + min(20, len(duplicate_rows)) + min(45, len(secret_rows) * 10)
    if not required_shape:
        penalty += 15
    return DatasetReport(
        path=str(path),
        format=path.suffix.lower().lstrip("."),
        rows=total,
        valid_rows=total - len(invalid_rows),
        duplicate_rows=len(duplicate_rows),
        possible_secret_rows=len(secret_rows),
        train_test_leakage_candidates=0,
        health_score=max(0, 100 - penalty),
        columns=sorted(columns - {"__parse_error__"}),
        issues=issues,
    )


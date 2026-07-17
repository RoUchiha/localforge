from __future__ import annotations

import sqlite3
import subprocess
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .schemas import JobRecord


class JobStore:
    def __init__(self, database: Path):
        self.database = database.expanduser().resolve()
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, payload TEXT NOT NULL
            )""")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.database, timeout=30)

    def put(self, record: JobRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO jobs (id, payload) VALUES (?, ?)",
                (record.id, record.model_dump_json()),
            )

    def get(self, job_id: str) -> JobRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT payload FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return JobRecord.model_validate_json(row[0]) if row else None

    def list(self) -> list[JobRecord]:
        with self._connect() as connection:
            rows = connection.execute("SELECT payload FROM jobs ORDER BY rowid DESC").fetchall()
        return [JobRecord.model_validate_json(row[0]) for row in rows]


class JobRunner:
    def __init__(self, store: JobStore):
        self.store = store

    def start(self, command: list[str], output_dir: Path, kind: str = "train") -> JobRecord:
        now = datetime.now(UTC).isoformat()
        record = JobRecord(
            id=uuid.uuid4().hex,
            kind=kind,
            status="queued",
            created_at=now,
            updated_at=now,
            command=command,
            output_dir=str(output_dir),
        )
        self.store.put(record)
        threading.Thread(target=self._execute, args=(record,), daemon=True).start()
        return record

    def _execute(self, record: JobRecord) -> None:
        output = Path(record.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        log_path = output / "run.log"
        record.status = "running"
        record.updated_at = datetime.now(UTC).isoformat()
        self.store.put(record)
        try:
            with log_path.open("a", encoding="utf-8") as log:
                process = subprocess.run(
                    record.command,
                    cwd=output,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    check=False,
                    shell=False,
                )
            record.exit_code = process.returncode
            record.status = "succeeded" if process.returncode == 0 else "failed"
        except OSError as exc:
            record.status = "failed"
            record.error = str(exc)
        record.updated_at = datetime.now(UTC).isoformat()
        self.store.put(record)

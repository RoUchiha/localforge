from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .dataset_inspector import inspect_dataset
from .jobs import JobRunner, JobStore
from .packaging import build_package
from .planner import create_plan
from .recipes import training_command, write_recipe
from .schemas import JobRecord, PackageRequest, PlanRequest, RunRequest


DATA_DIR = Path(os.getenv("LOCALFORGE_DATA_DIR", Path.home() / ".localforge")).expanduser().resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
JOB_STORE = JobStore(DATA_DIR / "jobs.sqlite3")
RUNNER = JobRunner(JOB_STORE)

app = FastAPI(
    title="LocalForge Engine",
    version="0.1.0",
    description="Loopback-only orchestration API for private model tuning workflows.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000", "http://localhost:3000",
        "http://127.0.0.1:5173", "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ready",
        "privacy_boundary": "loopback",
        "platform": platform.system(),
        "ollama": shutil.which("ollama") is not None,
        "python": platform.python_version(),
    }


@app.post("/v1/plans")
async def plan(request: PlanRequest):
    return await create_plan(request)


@app.post("/v1/datasets/inspect")
async def inspect_upload(file: UploadFile = File(...)):
    suffix = Path(file.filename or "dataset.jsonl").suffix.lower()
    if suffix not in {".jsonl", ".csv"}:
        raise HTTPException(415, "Supported dataset formats are JSONL and CSV")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / f"{os.urandom(8).hex()}{suffix}"
    size = 0
    with destination.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > 2 * 1024**3:
                destination.unlink(missing_ok=True)
                raise HTTPException(413, "Dataset exceeds the 2 GB inspection limit")
            handle.write(chunk)
    try:
        return inspect_dataset(destination)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/v1/runs", response_model=JobRecord)
def start_run(request: RunRequest):
    if not request.confirm:
        raise HTTPException(409, "Set confirm=true after reviewing the generated command")
    dataset, output = request.resolved_paths()
    if not dataset.is_file():
        raise HTTPException(400, "Dataset path does not exist")
    output.mkdir(parents=True, exist_ok=True)
    recipe = write_recipe(request.plan, output / "recipe.json")
    return RUNNER.start(training_command(recipe, dataset, output), output)


@app.get("/v1/jobs", response_model=list[JobRecord])
def list_jobs():
    return JOB_STORE.list()


@app.get("/v1/jobs/{job_id}", response_model=JobRecord)
def get_job(job_id: str):
    record = JOB_STORE.get(job_id)
    if record is None:
        raise HTTPException(404, "Job not found")
    return record


@app.post("/v1/packages")
def package(request: PackageRequest):
    try:
        path = build_package(request)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"path": str(path), "status": "ready"}


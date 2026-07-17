from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class TaskType(StrEnum):
    instruction = "instruction_following"
    extraction = "structured_extraction"
    classification = "classification"
    style = "style_adaptation"
    summarization = "summarization"


class TuningMethod(StrEnum):
    qlora = "qlora"
    lora = "lora"
    full = "full"


class DeploymentTarget(StrEnum):
    ollama = "ollama"
    vllm = "vllm"
    gguf = "gguf"
    adapter = "adapter"


class HardwareProfile(BaseModel):
    gpu_vram_gb: float | None = Field(default=None, ge=0)
    system_ram_gb: float | None = Field(default=None, ge=0)
    cpu_only: bool = False
    os: str | None = None


class PlanRequest(BaseModel):
    goal: str = Field(min_length=12, max_length=8000)
    hardware: HardwareProfile = Field(default_factory=HardwareProfile)
    planner_model: str | None = None


class TrainingRecipe(BaseModel):
    method: TuningMethod
    epochs: int = Field(ge=1, le=20)
    learning_rate: float = Field(gt=0, le=0.1)
    batch_size: int = Field(ge=1, le=128)
    gradient_accumulation_steps: int = Field(ge=1, le=1024)
    lora_rank: int | None = Field(default=None, ge=1, le=512)
    lora_alpha: int | None = Field(default=None, ge=1, le=1024)
    max_sequence_length: int = Field(ge=128, le=131072)
    quantization_bits: int | None = None

    @field_validator("quantization_bits")
    @classmethod
    def valid_quantization(cls, value: int | None) -> int | None:
        if value not in (None, 4, 8):
            raise ValueError("quantization_bits must be 4, 8, or null")
        return value


class EvaluationGate(BaseModel):
    metric: str
    threshold: float
    direction: str = "gte"
    required: bool = True


class ModelPlan(BaseModel):
    name: str
    task_type: TaskType
    base_model: str
    rationale: list[str]
    data_format: str
    recipe: TrainingRecipe
    evaluation_gates: list[EvaluationGate]
    deployment_target: DeploymentTarget
    warnings: list[str] = Field(default_factory=list)
    source: str = "rules"


class DatasetIssue(BaseModel):
    code: str
    severity: str
    message: str
    rows: list[int] = Field(default_factory=list)


class DatasetReport(BaseModel):
    path: str
    format: str
    rows: int
    valid_rows: int
    duplicate_rows: int
    possible_secret_rows: int
    train_test_leakage_candidates: int
    health_score: int = Field(ge=0, le=100)
    columns: list[str]
    issues: list[DatasetIssue]


class RunRequest(BaseModel):
    plan: ModelPlan
    dataset_path: str
    output_dir: str
    confirm: bool = False

    def resolved_paths(self) -> tuple[Path, Path]:
        return Path(self.dataset_path).expanduser().resolve(), Path(self.output_dir).expanduser().resolve()


class JobRecord(BaseModel):
    id: str
    kind: str
    status: str
    created_at: str
    updated_at: str
    command: list[str]
    output_dir: str
    exit_code: int | None = None
    error: str | None = None


class PackageRequest(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{1,80}$")
    version: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$")
    base_model: str
    adapter_path: str
    output_dir: str
    target: DeploymentTarget
    evaluation_report_path: str | None = None


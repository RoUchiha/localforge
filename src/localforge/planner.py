from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from .schemas import (
    DeploymentTarget,
    EvaluationGate,
    ModelPlan,
    PlanRequest,
    TaskType,
    TrainingRecipe,
    TuningMethod,
)


PLANNER_SYSTEM = """You are LocalForge's local model architect. Convert the user's goal into a
conservative supervised-fine-tuning plan. Never claim a model or dataset exists when it was not
provided. Prefer QLoRA for a single constrained GPU, LoRA for moderate local hardware, and full
tuning only for explicitly capable multi-GPU systems. Return only JSON matching the supplied schema.
Include measurable evaluation gates and warn when the goal is underspecified."""


def _slug(goal: str) -> str:
    words = re.findall(r"[a-z0-9]+", goal.lower())[:5]
    return "-".join(words)[:48] or "local-model"


def rules_plan(request: PlanRequest) -> ModelPlan:
    goal = request.goal.lower()
    if re.search(r"extract|json|field|invoice|contract", goal):
        task = TaskType.extraction
        data_format = "conversational prompt-completion JSONL with schema-valid answers"
    elif re.search(r"classif|label|route|triage|category", goal):
        task = TaskType.classification
        data_format = "prompt-completion JSONL with a closed label set"
    elif re.search(r"rewrite|voice|tone|style|writing", goal):
        task = TaskType.style
        data_format = "conversational prompt-completion JSONL with source and ideal rewrite"
    elif re.search(r"summari[sz]|brief|digest", goal):
        task = TaskType.summarization
        data_format = "prompt-completion JSONL with source text and reference summary"
    else:
        task = TaskType.instruction
        data_format = "conversational JSONL using messages with system, user, and assistant roles"

    vram = request.hardware.gpu_vram_gb
    constrained = request.hardware.cpu_only or vram is None or vram < 16
    base_model = "Qwen/Qwen2.5-3B-Instruct" if constrained else "meta-llama/Llama-3.1-8B-Instruct"
    method = TuningMethod.qlora if constrained and not request.hardware.cpu_only else TuningMethod.lora
    warnings: list[str] = []
    if request.hardware.cpu_only:
        warnings.append("CPU-only training can be very slow; start with a sub-1B model or rent isolated compute.")
    if len(request.goal.split()) < 20:
        warnings.append("Add representative examples, failure cases, and a hardware limit before training.")

    gates = [
        EvaluationGate(metric="task_accuracy", threshold=0.85),
        EvaluationGate(metric="format_validity", threshold=0.98 if task == TaskType.extraction else 0.95),
        EvaluationGate(metric="regression_rate", threshold=0.05, direction="lte"),
        EvaluationGate(metric="pii_leakage_count", threshold=0, direction="lte"),
    ]
    return ModelPlan(
        name=_slug(request.goal),
        task_type=task,
        base_model=base_model,
        rationale=[
            "Parameter-efficient tuning preserves the base weights and produces a small, portable adapter.",
            "The chosen model size is conservative for the declared local hardware.",
            "Required evaluation gates block packaging when safety or task quality regresses.",
        ],
        data_format=data_format,
        recipe=TrainingRecipe(
            method=method,
            epochs=3,
            learning_rate=2e-4,
            batch_size=1,
            gradient_accumulation_steps=16,
            lora_rank=16,
            lora_alpha=32,
            max_sequence_length=2048,
            quantization_bits=4 if method == TuningMethod.qlora else None,
        ),
        evaluation_gates=gates,
        deployment_target=DeploymentTarget.ollama,
        warnings=warnings,
    )


async def create_plan(request: PlanRequest) -> ModelPlan:
    """Use a local Ollama planner when available, with a deterministic offline fallback."""
    fallback = rules_plan(request)
    model = request.planner_model or os.getenv("LOCALFORGE_PLANNER_MODEL", "qwen2.5:3b")
    base_url = os.getenv("LOCALFORGE_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    payload: dict[str, Any] = {
        "model": model,
        "stream": False,
        "format": ModelPlan.model_json_schema(),
        "messages": [
            {"role": "system", "content": PLANNER_SYSTEM},
            {"role": "user", "content": request.model_dump_json()},
        ],
        "options": {"temperature": 0},
    }
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(f"{base_url}/api/chat", json=payload)
            response.raise_for_status()
        content = response.json()["message"]["content"]
        plan = ModelPlan.model_validate(json.loads(content))
        plan.source = f"ollama:{model}"
        return plan
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValueError):
        return fallback


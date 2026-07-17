from __future__ import annotations

import json
from pathlib import Path

from .schemas import ModelPlan


def estimate_peak_vram_gb(parameter_billions: float, plan: ModelPlan) -> float:
    recipe = plan.recipe
    weight_bytes = 0.5 if recipe.quantization_bits == 4 else 1.0 if recipe.quantization_bits == 8 else 2.0
    base = parameter_billions * weight_bytes
    optimizer = parameter_billions * (0.08 if recipe.method.value in {"lora", "qlora"} else 8.0)
    activations = 1.3 + (recipe.max_sequence_length / 2048) * recipe.batch_size * 0.55
    return round((base + optimizer + activations) * 1.15, 2)


def write_recipe(plan: ModelPlan, destination: Path) -> Path:
    destination = destination.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(plan.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")
    return destination


def training_command(recipe_path: Path, dataset_path: Path, output_dir: Path) -> list[str]:
    return [
        "python", "-m", "localforge.train",
        "--recipe", str(recipe_path),
        "--dataset", str(dataset_path),
        "--output", str(output_dir),
    ]


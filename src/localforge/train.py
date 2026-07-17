from __future__ import annotations

import argparse
import json
from pathlib import Path


def train(recipe_path: Path, dataset_path: Path, output_dir: Path) -> None:
    try:
        import torch
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import BitsAndBytesConfig
        from trl import SFTConfig, SFTTrainer
    except ImportError as exc:
        raise SystemExit("Training extras are missing. Install with: pip install -e '.[train]'") from exc

    from .schemas import ModelPlan, TuningMethod

    plan = ModelPlan.model_validate(json.loads(recipe_path.read_text(encoding="utf-8")))
    recipe = plan.recipe
    data_files = {"train": str(dataset_path)}
    dataset_type = "json" if dataset_path.suffix.lower() == ".jsonl" else "csv"
    dataset = load_dataset(dataset_type, data_files=data_files, split="train")
    output_dir.mkdir(parents=True, exist_ok=True)

    peft_config = None
    if recipe.method in {TuningMethod.lora, TuningMethod.qlora}:
        peft_config = LoraConfig(
            r=recipe.lora_rank or 16,
            lora_alpha=recipe.lora_alpha or 32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules="all-linear",
        )

    model_kwargs: dict[str, object] = {"device_map": "auto"}
    if recipe.method == TuningMethod.qlora:
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        )

    config = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=recipe.epochs,
        learning_rate=recipe.learning_rate,
        per_device_train_batch_size=recipe.batch_size,
        gradient_accumulation_steps=recipe.gradient_accumulation_steps,
        max_length=recipe.max_sequence_length,
        logging_steps=10,
        save_strategy="epoch",
        report_to="none",
        bf16=torch.cuda.is_available() and torch.cuda.is_bf16_supported(),
        fp16=torch.cuda.is_available() and not torch.cuda.is_bf16_supported(),
        model_init_kwargs=model_kwargs,
    )
    trainer = SFTTrainer(
        model=plan.base_model,
        args=config,
        train_dataset=dataset,
        peft_config=peft_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir / "adapter"))
    (output_dir / "plan.json").write_text(plan.model_dump_json(indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a reviewed LocalForge training recipe")
    parser.add_argument("--recipe", required=True, type=Path)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    train(args.recipe.resolve(), args.dataset.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()

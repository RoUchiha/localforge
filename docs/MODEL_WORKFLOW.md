# Model workflow

## 1. Define

State the task, desired behavior, prohibited behavior, examples, latency target, deployment environment, and hardware limit. The planner returns a typed proposal; it never starts training.

## 2. Prepare data

Use conversational `messages`, `prompt` plus `completion`, or a standard `text` field. Keep a frozen holdout split that is never used for tuning. Include ordinary examples, difficult edge cases, and examples of correct refusal behavior.

## 3. Tune

- **QLoRA:** practical default for a constrained NVIDIA GPU; quantized base weights plus trainable adapters.
- **LoRA:** uses more memory but avoids a quantized training base and remains easy to merge.
- **Full tuning:** reserved for sufficient multi-GPU hardware and a justified need.

The generated recipe uses completion-only loss when the dataset is prompt-completion shaped and the model's normal chat template for conversational data.

## 4. Evaluate

Run the base model and tuned adapter with identical prompts and decoding settings. Keep the order blinded for human comparisons. Treat format validity, safety regressions, leakage, and latency as first-class metrics alongside task quality.

## 5. Package

Package only the checkpoint that produced the reviewed evaluation result. Keep the exact base-model identifier beside the adapter. Ollama adapters must be used with the same base-model family; vLLM serves LoRA adapters with `--enable-lora` and a named `--lora-modules` mapping.


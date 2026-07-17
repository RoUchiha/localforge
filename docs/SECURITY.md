# Security and privacy model

## Protected assets

LocalForge treats prompts, datasets, model outputs, adapter weights, evaluation cases, and environment details as private local assets.

## Default controls

- The Engine binds to loopback only. The CLI rejects non-loopback hosts.
- CORS allows only the documented local Studio origins.
- Planner calls go only to the configurable local Ollama URL, which defaults to `127.0.0.1`.
- Dataset inspection caps uploads at 2 GB and accepts only JSONL or CSV.
- The inspector flags likely API keys, passwords, GitHub tokens, and private-key blocks.
- Training commands are constructed as fixed argument arrays and executed with `shell=False`.
- A run requires `confirm=true` or the CLI `--confirm` flag.
- Packaging refuses to overwrite a versioned release directory.
- Release files are hashed after assembly.

## Threats not solved automatically

- A malicious model or model repository may require remote code. LocalForge does not enable `trust_remote_code`.
- Python and model dependencies are part of the local supply chain. Use a locked environment and scan it for production.
- Prompt injection inside training data can become learned behavior. Dataset review remains required.
- Secret scanning is heuristic and cannot prove a dataset is clean.
- Binding the Engine to a LAN or public interface changes the threat model and should be done only behind deliberate authentication and TLS.
- A model's license can restrict fine-tuning, commercial use, or redistribution.

## Reporting

Do not include private data, model weights, credentials, or customer examples in a public issue. Provide a minimal synthetic reproduction.


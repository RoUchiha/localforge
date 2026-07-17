from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from .schemas import DeploymentTarget, PackageRequest


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_package(request: PackageRequest) -> Path:
    adapter = Path(request.adapter_path).expanduser().resolve()
    if not adapter.exists():
        raise FileNotFoundError(adapter)
    release = Path(request.output_dir).expanduser().resolve() / f"{request.name}-{request.version}"
    if release.exists():
        raise FileExistsError(f"Release already exists: {release}")
    release.mkdir(parents=True)
    target_adapter = release / "adapter"
    shutil.copytree(adapter, target_adapter) if adapter.is_dir() else shutil.copy2(adapter, target_adapter)

    if request.target == DeploymentTarget.ollama:
        (release / "Modelfile").write_text(
            f"FROM {request.base_model}\nADAPTER ./adapter\nPARAMETER temperature 0.2\n",
            encoding="utf-8",
        )
        launch = f"ollama create {request.name}:{request.version} -f {release / 'Modelfile'}"
    elif request.target == DeploymentTarget.vllm:
        launch = f"vllm serve {request.base_model} --enable-lora --lora-modules {request.name}={target_adapter}"
    elif request.target == DeploymentTarget.gguf:
        launch = "Use llama.cpp convert_lora_to_gguf.py, then quantize the merged GGUF artifact."
    else:
        launch = f"transformers.AutoPeftModelForCausalLM.from_pretrained('{target_adapter}')"

    if request.evaluation_report_path:
        report = Path(request.evaluation_report_path).expanduser().resolve()
        if report.is_file():
            shutil.copy2(report, release / "evaluation.json")

    files = [path for path in release.rglob("*") if path.is_file()]
    manifest = {
        "name": request.name,
        "version": request.version,
        "base_model": request.base_model,
        "target": request.target,
        "created_at": datetime.now(UTC).isoformat(),
        "launch": launch,
        "files": {path.relative_to(release).as_posix(): _sha256(path) for path in files},
    }
    (release / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return release

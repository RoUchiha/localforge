import json

import pytest

from localforge.packaging import build_package
from localforge.schemas import DeploymentTarget, PackageRequest


def test_packaging_writes_immutable_manifest(tmp_path):
    adapter = tmp_path / "adapter-source"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}", encoding="utf-8")
    request = PackageRequest(
        name="support-specialist",
        version="v1",
        base_model="Qwen/Qwen2.5-3B-Instruct",
        adapter_path=str(adapter),
        output_dir=str(tmp_path / "releases"),
        target=DeploymentTarget.ollama,
    )
    release = build_package(request)
    manifest = json.loads((release / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["target"] == "ollama"
    assert "adapter/adapter_config.json" in manifest["files"]
    with pytest.raises(FileExistsError):
        build_package(request)


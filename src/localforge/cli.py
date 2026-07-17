from __future__ import annotations

import asyncio
import json
import platform
import shutil
import subprocess
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .dataset_inspector import inspect_dataset
from .evaluation import evaluate_file
from .packaging import build_package
from .planner import create_plan
from .recipes import training_command
from .schemas import DeploymentTarget, HardwareProfile, ModelPlan, PackageRequest, PlanRequest


app = typer.Typer(no_args_is_help=True, help="Private local-model tuning, evaluation, and deployment.")
console = Console()


@app.command()
def doctor() -> None:
    """Check the local tools LocalForge can use."""
    table = Table(title="LocalForge environment")
    table.add_column("Capability")
    table.add_column("Status")
    for name, executable in [("Python", "python"), ("Git", "git"), ("Ollama", "ollama"), ("NVIDIA tools", "nvidia-smi")]:
        table.add_row(name, shutil.which(executable) or "not detected")
    table.add_row("Platform", platform.platform())
    console.print(table)


@app.command()
def plan(
    goal: str = typer.Argument(..., help="Describe the desired model behavior."),
    output: Path = typer.Option(Path("localforge-plan.json"), "--output", "-o"),
    vram: float | None = typer.Option(None, help="Available GPU VRAM in GB."),
) -> None:
    """Turn a natural-language goal into a reviewable training plan."""
    request = PlanRequest(goal=goal, hardware=HardwareProfile(gpu_vram_gb=vram))
    result = asyncio.run(create_plan(request))
    output.write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    console.print(f"[green]Plan written to[/green] {output.resolve()} ({result.source})")


@app.command("inspect")
def inspect_command(dataset: Path) -> None:
    """Inspect a local dataset for shape, duplicates, and possible secrets."""
    report = inspect_dataset(dataset)
    console.print_json(json.dumps(report.model_dump(mode="json")))


@app.command()
def run(
    recipe: Path = typer.Argument(..., exists=True, readable=True),
    dataset: Path = typer.Argument(..., exists=True, readable=True),
    output: Path = typer.Argument(...),
    confirm: bool = typer.Option(False, "--confirm", help="Run the displayed local training command."),
) -> None:
    """Run a reviewed recipe in a separate local process."""
    plan = ModelPlan.model_validate_json(recipe.read_text(encoding="utf-8"))
    output = output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    reviewed_recipe = output / "recipe.json"
    reviewed_recipe.write_text(plan.model_dump_json(indent=2) + "\n", encoding="utf-8")
    command = training_command(reviewed_recipe, dataset.resolve(), output)
    console.print("[bold]Command:[/bold] " + subprocess.list2cmdline(command))
    if not confirm:
        raise typer.Exit(code=2)
    result = subprocess.run(command, check=False, shell=False)
    raise typer.Exit(code=result.returncode)


@app.command()
def evaluate(
    results: Path = typer.Argument(..., exists=True, readable=True),
    output: Path = typer.Option(Path("evaluation.json"), "--output", "-o"),
) -> None:
    """Score prediction/reference JSONL with deterministic metrics."""
    report = evaluate_file(results)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    console.print_json(json.dumps(report))
    console.print(f"[green]Evaluation written to[/green] {output.resolve()}")


@app.command("package")
def package_command(
    adapter: Path = typer.Argument(..., exists=True),
    name: str = typer.Option(...),
    version: str = typer.Option(...),
    base_model: str = typer.Option(..., "--base-model"),
    target: DeploymentTarget = typer.Option(DeploymentTarget.adapter),
    output: Path = typer.Option(Path("releases")),
    evaluation: Path | None = typer.Option(None, exists=True),
) -> None:
    """Build an immutable, checksummed release bundle."""
    release = build_package(PackageRequest(
        name=name,
        version=version,
        base_model=base_model,
        adapter_path=str(adapter),
        output_dir=str(output),
        target=target,
        evaluation_report_path=str(evaluation) if evaluation else None,
    ))
    console.print(f"[green]Release ready at[/green] {release}")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8844) -> None:
    """Start the loopback-only LocalForge engine."""
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise typer.BadParameter("LocalForge binds to loopback by default; use a reverse proxy deliberately.")
    import uvicorn
    uvicorn.run("localforge.api:app", host=host, port=port, reload=False)

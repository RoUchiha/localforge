from localforge.planner import rules_plan
from localforge.schemas import HardwareProfile, PlanRequest, TaskType, TuningMethod


def test_rules_planner_selects_structured_extraction_and_qlora():
    plan = rules_plan(
        PlanRequest(
            goal="Extract vendor name, renewal date, value, and risk clauses from private contracts as JSON.",
            hardware=HardwareProfile(gpu_vram_gb=12),
        )
    )
    assert plan.task_type == TaskType.extraction
    assert plan.recipe.method == TuningMethod.qlora
    assert plan.recipe.quantization_bits == 4
    assert any(gate.metric == "format_validity" for gate in plan.evaluation_gates)


def test_rules_planner_warns_on_cpu_only_training():
    plan = rules_plan(
        PlanRequest(
            goal="Rewrite long technical release notes in a direct internal company voice.",
            hardware=HardwareProfile(cpu_only=True),
        )
    )
    assert plan.task_type == TaskType.style
    assert any("CPU-only" in warning for warning in plan.warnings)


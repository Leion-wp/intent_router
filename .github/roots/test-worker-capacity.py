#!/usr/bin/env python3
import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
WORKFLOWS = ROOT.parent / "workflows"

spec = importlib.util.spec_from_file_location("planning", ROOT / "validate-planning.py")
planning = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(planning)


def proves_chatgpt_exclusion(text: str) -> bool:
    return 'factory:agent:chatgpt' in text and '== null' in text


def main() -> None:
    capacity = json.loads((ROOT / "factory-worker-capacity.json").read_text())
    assert capacity["version"] == 1
    assert capacity["workers"]["jules"]["max_concurrency"] == 15
    assert capacity["workers"]["chatgpt"]["max_concurrency"] == 1
    assert capacity["workers"]["chatgpt"]["selection_label"] == "factory:agent:chatgpt"
    assert planning.dynamic_minimum_task_count(capacity) == 23
    assert capacity["planning"]["max_issues_per_milestone"] >= 23

    scheduler = (WORKFLOWS / "factory-fleet-scheduler.yml").read_text()
    watchdog = (WORKFLOWS / "factory-fleet-watchdog.yml").read_text()
    dispatcher = (WORKFLOWS / "factory-cross-repo-dispatch.yml").read_text()
    ci_rework = (WORKFLOWS / "factory-fleet-jules-rework.yml").read_text()
    quality_rework = (WORKFLOWS / "factory-fleet-jules-quality-rework.yml").read_text()
    telemetry = (WORKFLOWS / "factory-portfolio-telemetry.yml").read_text()
    product_schema = json.loads((ROOT / "factory-product-decision.schema.json").read_text())
    plan_schema = json.loads((ROOT / "factory-milestone-plan.schema.json").read_text())
    portfolio_schema = json.loads((ROOT / "factory-portfolio-telemetry.schema.json").read_text())

    assert "factory-fleet-scheduler-v4" in scheduler
    assert "active_slots" in scheduler
    assert "available_slots" in scheduler
    assert 'head -n "$available_slots"' in scheduler
    assert "Reserve selected identities and dispatch Jules pool" in scheduler
    assert "GLOBAL_WORKER_LOCK" not in scheduler
    assert proves_chatgpt_exclusion(scheduler)
    assert "worker=jules" in scheduler

    assert "factory-fleet-watchdog-v4" in watchdog
    assert proves_chatgpt_exclusion(watchdog)
    assert 'active_slots" -gt "$max_concurrency' in watchdog
    assert "sequential invariant is violated" not in watchdog
    assert "excluded from Jules capacity" in watchdog

    assert "factory-cross-${{ inputs.repository }}-${{ inputs.issue_number }}" in dispatcher
    assert "WORKER_ROUTE_REFUSED" in dispatcher
    assert "factory:agent:chatgpt" in dispatcher
    assert proves_chatgpt_exclusion(ci_rework)
    assert proves_chatgpt_exclusion(quality_rework)

    assert portfolio_schema["properties"]["version"]["const"] == 2
    assert "worker_lock" not in portfolio_schema["required"]
    assert "worker_lock" not in portfolio_schema["properties"]
    assert "worker_lock" not in telemetry
    assert "roots-portfolio-telemetry:v2" in telemetry
    assert "Operational telemetry reports independent bounded provider pools" in telemetry
    assert 'worker_capacity:{provider:"jules"' in telemetry
    assert 'chatgpt_capacity:{provider:"chatgpt"' in telemetry

    decision_max = product_schema["properties"]["milestone"]["oneOf"][1]["properties"]["tasks"]["maxItems"]
    plan_max = plan_schema["properties"]["tasks"]["maxItems"]
    assert decision_max >= planning.dynamic_minimum_task_count(capacity)
    assert plan_max >= planning.dynamic_minimum_task_count(capacity)

    print("worker capacity and routing tests passed")


if __name__ == "__main__":
    main()

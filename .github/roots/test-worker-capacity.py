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


def main() -> None:
    capacity = json.loads((ROOT / "factory-worker-capacity.json").read_text())
    assert capacity["version"] == 1
    assert capacity["workers"]["jules"]["max_concurrency"] == 15
    assert planning.dynamic_minimum_task_count(capacity) == 23
    assert capacity["planning"]["max_issues_per_milestone"] >= 23

    scheduler = (WORKFLOWS / "factory-fleet-scheduler.yml").read_text()
    watchdog = (WORKFLOWS / "factory-fleet-watchdog.yml").read_text()
    dispatcher = (WORKFLOWS / "factory-cross-repo-dispatch.yml").read_text()
    product_schema = json.loads((ROOT / "factory-product-decision.schema.json").read_text())
    plan_schema = json.loads((ROOT / "factory-milestone-plan.schema.json").read_text())

    assert "factory-fleet-scheduler-v3" in scheduler
    assert "active_slots" in scheduler
    assert "available_slots" in scheduler
    assert 'head -n "$available_slots"' in scheduler
    assert "Reserve selected identities and dispatch Jules pool" in scheduler
    assert "GLOBAL_WORKER_LOCK" not in scheduler
    assert "dispatching + dispatched identities <= configured Jules max_concurrency" in scheduler

    assert "factory-fleet-watchdog-v3" in watchdog
    assert 'active_slots="$((active_slots + dispatching_count + dispatched_count))"' in watchdog
    assert 'active_slots" -gt "$max_concurrency' in watchdog
    assert "sequential invariant is violated" not in watchdog
    assert "Escalated identities remain task-locked" in watchdog

    assert "factory-cross-${{ inputs.repository }}-${{ inputs.issue_number }}" in dispatcher

    decision_max = product_schema["properties"]["milestone"]["oneOf"][1]["properties"]["tasks"]["maxItems"]
    plan_max = plan_schema["properties"]["tasks"]["maxItems"]
    assert decision_max >= planning.dynamic_minimum_task_count(capacity)
    assert plan_max >= planning.dynamic_minimum_task_count(capacity)

    print("worker capacity tests passed")


if __name__ == "__main__":
    main()

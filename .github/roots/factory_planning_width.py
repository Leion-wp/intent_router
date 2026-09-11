#!/usr/bin/env python3
"""Deterministic ready-width diagnostics for Roots dynamic milestone DAGs.

This is a planning-quality signal, not an additional scheduling or acceptance quota.
It never removes dependencies or mutates product state.
"""
from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent


class PlanningWidthError(ValueError):
    pass


def _task_map(tasks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for task in tasks:
        if not isinstance(task, dict):
            raise PlanningWidthError("task must be an object")
        task_id = task.get("id")
        if not isinstance(task_id, str) or not task_id:
            raise PlanningWidthError("task id must be a non-empty string")
        if task_id in by_id:
            raise PlanningWidthError(f"duplicate task identity: {task_id}")
        by_id[task_id] = task

    known = set(by_id)
    for task_id, task in by_id.items():
        deps = task.get("blocked_by", [])
        if not isinstance(deps, list) or any(not isinstance(dep, str) for dep in deps):
            raise PlanningWidthError(f"blocked_by must be a string array for {task_id}")
        if task_id in deps:
            raise PlanningWidthError(f"self dependency: {task_id}")
        missing = sorted(set(deps) - known)
        if missing:
            raise PlanningWidthError(f"missing dependency for {task_id}: {missing}")
    return by_id


def topological_waves(tasks: list[dict[str, Any]]) -> list[list[str]]:
    """Return deterministic Kahn waves without changing dependency semantics."""
    by_id = _task_map(tasks)
    done: set[str] = set()
    waves: list[list[str]] = []

    while len(done) < len(by_id):
        ready = sorted(
            task_id
            for task_id, task in by_id.items()
            if task_id not in done and set(task.get("blocked_by", [])) <= done
        )
        if not ready:
            raise PlanningWidthError(
                f"circular dependency among: {sorted(set(by_id) - done)}"
            )
        waves.append(ready)
        done.update(ready)

    return waves


def width_profile(tasks: list[dict[str, Any]], worker_capacity: int) -> dict[str, Any]:
    if not isinstance(worker_capacity, int) or worker_capacity < 1:
        raise PlanningWidthError("worker_capacity must be a positive integer")
    waves = topological_waves(tasks)
    widths = [len(wave) for wave in waves]
    nonfinal = widths[:-1]
    under_capacity = [index for index, width in enumerate(nonfinal) if width < worker_capacity]
    return {
        "task_count": len(tasks),
        "worker_capacity": worker_capacity,
        "wave_widths": widths,
        "initial_ready": widths[0] if widths else 0,
        "min_nonfinal_wave": min(nonfinal) if nonfinal else None,
        "nonfinal_under_capacity_waves": under_capacity,
    }


def _capacity() -> int:
    contract = json.loads((ROOT / "factory-worker-capacity.json").read_text(encoding="utf-8"))
    capacity = contract.get("workers", {}).get("jules", {}).get("max_concurrency")
    if not isinstance(capacity, int) or capacity < 1:
        raise PlanningWidthError("invalid Jules capacity contract")
    return capacity


def _tasks(document: Any) -> list[dict[str, Any]]:
    if isinstance(document, dict) and isinstance(document.get("tasks"), list):
        return document["tasks"]
    milestone = document.get("milestone") if isinstance(document, dict) else None
    if isinstance(milestone, dict) and isinstance(milestone.get("tasks"), list):
        return milestone["tasks"]
    raise PlanningWidthError("document must contain tasks[] or milestone.tasks[]")


def main() -> None:
    if len(sys.argv) not in {2, 3}:
        raise SystemExit("usage: factory_planning_width.py <plan-or-decision.json> [worker-capacity]")
    document = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    capacity = int(sys.argv[2]) if len(sys.argv) == 3 else _capacity()
    print(json.dumps(width_profile(_tasks(document), capacity), sort_keys=True))


if __name__ == "__main__":
    main()

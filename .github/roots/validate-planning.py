#!/usr/bin/env python3
import json
import pathlib
import re
import sys

try:
    import jsonschema
except ImportError as exc:
    raise SystemExit("jsonschema dependency is required") from exc

ROOT = pathlib.Path(__file__).resolve().parent
FORBIDDEN = (
    ".github/workflows",
    "workflow permission",
    "github permission",
    "create secret",
    "modify secret",
    "rotate secret",
    "export secret",
    "production deploy",
    "deploy production",
    "disable human gate",
)


def load(name: str):
    with (ROOT / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def schema_store():
    names = (
        "factory-roadmap.schema.json",
        "factory-issue-plan.schema.json",
        "factory-milestone-plan.schema.json",
        "factory-planning-result.schema.json",
    )
    schemas = {name: load(name) for name in names}
    return schemas, {schema["$id"]: schema for schema in schemas.values()}


def validate_schema(document, schema_name: str):
    schemas, store = schema_store()
    schema = schemas[schema_name]
    resolver = jsonschema.RefResolver.from_schema(schema, store=store)
    jsonschema.Draft202012Validator(schema, resolver=resolver).validate(document)


def semantic_validate_tasks(tasks):
    ids = [task["id"] for task in tasks]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate task identities")
    known = set(ids)
    graph = {}
    for task in tasks:
        deps = task["blocked_by"]
        if task["id"] in deps:
            raise ValueError(f"self dependency: {task['id']}")
        missing = [dep for dep in deps if dep not in known]
        if missing:
            raise ValueError(f"missing dependency for {task['id']}: {missing}")
        text = " ".join(task["scope"] + task["acceptance_criteria"] + task["done"]).lower()
        for forbidden in FORBIDDEN:
            if forbidden in text:
                raise ValueError(f"forbidden control-plane mutation in {task['id']}: {forbidden}")
        if len(task["scope"]) > 12 or len(task["acceptance_criteria"]) > 12:
            raise ValueError(f"unbounded task: {task['id']}")
        graph[task["id"]] = set(deps)

    remaining = {node: set(deps) for node, deps in graph.items()}
    while remaining:
        ready = {node for node, deps in remaining.items() if not deps}
        if not ready:
            raise ValueError(f"circular dependency among: {sorted(remaining)}")
        for node in ready:
            remaining.pop(node)
        for deps in remaining.values():
            deps.difference_update(ready)


def validate_roadmap(path: pathlib.Path):
    with path.open(encoding="utf-8") as handle:
        roadmap = json.load(handle)
    validate_schema(roadmap, "factory-roadmap.schema.json")
    milestone_ids = [m["id"] for m in roadmap["milestones"]]
    titles = [m["title"] for m in roadmap["milestones"]]
    if len(milestone_ids) != len(set(milestone_ids)):
        raise ValueError("duplicate milestone identities")
    if len(titles) != len(set(titles)):
        raise ValueError("duplicate milestone titles")
    for milestone in roadmap["milestones"]:
        semantic_validate_tasks(milestone["tasks"])


def validate_plan(path: pathlib.Path):
    with path.open(encoding="utf-8") as handle:
        plan = json.load(handle)
    validate_schema(plan, "factory-milestone-plan.schema.json")
    semantic_validate_tasks(plan["tasks"])


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in {"roadmap", "plan"}:
        raise SystemExit("usage: validate-planning.py <roadmap|plan> <file.json>")
    target = pathlib.Path(sys.argv[2])
    if sys.argv[1] == "roadmap":
        validate_roadmap(target)
    else:
        validate_plan(target)
    print(f"planning validation passed: {target}")


if __name__ == "__main__":
    main()

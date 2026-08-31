#!/usr/bin/env python3
import json
import pathlib
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


def load_path(path: pathlib.Path):
    with path.open(encoding="utf-8") as handle:
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


def topological_tasks(tasks):
    by_id = {task["id"]: task for task in tasks}
    done = set()
    ordered = []
    while len(done) < len(by_id):
        ready = sorted(
            (
                task
                for task in by_id.values()
                if task["id"] not in done and set(task["blocked_by"]) <= done
            ),
            key=lambda task: (task["priority"], task["id"]),
        )
        if not ready:
            raise ValueError(f"circular dependency among: {sorted(set(by_id) - done)}")
        for task in ready:
            ordered.append(task["id"])
            done.add(task["id"])
    return ordered


def semantic_validate_tasks(tasks):
    ids = [task["id"] for task in tasks]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate task identities")
    known = set(ids)
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
    topological_tasks(tasks)


def validate_roadmap(path: pathlib.Path):
    roadmap = load_path(path)
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
    plan = load_path(path)
    validate_schema(plan, "factory-milestone-plan.schema.json")
    semantic_validate_tasks(plan["tasks"])


def next_index(roadmap_path: pathlib.Path, milestones_path: pathlib.Path):
    roadmap = load_path(roadmap_path)
    milestones = load_path(milestones_path)
    closed = {m["title"] for m in milestones if m.get("state") == "closed"}
    index = -1
    for i, milestone in enumerate(roadmap["milestones"]):
        if milestone["title"] in closed:
            index = max(index, i)
    print(index + 1)


def task_order(plan_path: pathlib.Path):
    plan = load_path(plan_path)
    for task_id in topological_tasks(plan["tasks"]):
        print(task_id)


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: validate-planning.py <roadmap|plan|next-index|task-order> ...")
    command = sys.argv[1]
    if command == "roadmap" and len(sys.argv) == 3:
        target = pathlib.Path(sys.argv[2])
        validate_roadmap(target)
        print(f"planning validation passed: {target}")
        return
    if command == "plan" and len(sys.argv) == 3:
        target = pathlib.Path(sys.argv[2])
        validate_plan(target)
        print(f"planning validation passed: {target}")
        return
    if command == "next-index" and len(sys.argv) == 4:
        next_index(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
        return
    if command == "task-order" and len(sys.argv) == 3:
        task_order(pathlib.Path(sys.argv[2]))
        return
    raise SystemExit("invalid planning validator command")


if __name__ == "__main__":
    main()

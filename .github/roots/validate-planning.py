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
    "inspect secret",
    "read secret",
    "production deploy",
    "deploy production",
    "disable human gate",
    "remove human gate",
    "expand permission",
    "change branch protection",
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
        "factory-product-state.schema.json",
        "factory-product-decision.schema.json",
        "factory-product-telemetry.schema.json",
    )
    schemas = {name: load(name) for name in names}
    return schemas, {schema["$id"]: schema for schema in schemas.values()}


def validate_schema(document, schema_name: str):
    schemas, store = schema_store()
    schema = schemas[schema_name]
    resolver = jsonschema.RefResolver.from_schema(schema, store=store)
    jsonschema.Draft202012Validator(schema, resolver=resolver).validate(document)


def reject_forbidden_text(text: str, context: str):
    normalized = text.lower()
    for forbidden in FORBIDDEN:
        if forbidden in normalized:
            raise ValueError(f"forbidden control-plane mutation in {context}: {forbidden}")


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
        text = " ".join(task["scope"] + task["acceptance_criteria"] + task["done"])
        reject_forbidden_text(text, task["id"])
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


def validate_state(path: pathlib.Path, expected_repo: str | None = None):
    state = load_path(path)
    validate_schema(state, "factory-product-state.schema.json")
    if expected_repo and state["repository"] != expected_repo:
        raise ValueError(f"product state repository mismatch: {state['repository']} != {expected_repo}")


def validate_telemetry(path: pathlib.Path, expected_repo: str | None = None):
    telemetry = load_path(path)
    validate_schema(telemetry, "factory-product-telemetry.schema.json")
    if expected_repo and telemetry["repository"] != expected_repo:
        raise ValueError(f"telemetry repository mismatch: {telemetry['repository']} != {expected_repo}")


def validate_decision(path: pathlib.Path, expected_repo: str | None = None):
    decision = load_path(path)
    validate_schema(decision, "factory-product-decision.schema.json")
    if expected_repo and decision["repository"] != expected_repo:
        raise ValueError(f"decision repository mismatch: {decision['repository']} != {expected_repo}")
    reject_forbidden_text(
        " ".join([decision["objective"], decision["hypothesis"], decision["success_metric"]] + decision["evidence"]),
        f"decision {decision['decision_id']}",
    )
    milestone = decision.get("milestone")
    if milestone:
        reject_forbidden_text(milestone["title"] + " " + milestone["description"], f"decision {decision['decision_id']} milestone")
        semantic_validate_tasks(milestone["tasks"])
    if decision["action"] == "PAUSE" and decision["human_gate"]["required"]:
        raise ValueError("PAUSE must remain a reversible product-state decision and cannot request privileged side effects")


def extract_decision(body_path: pathlib.Path, out_path: pathlib.Path):
    body = body_path.read_text(encoding="utf-8")
    if "<!-- roots-product-decision:v1 -->" not in body:
        raise ValueError("missing roots-product-decision:v1 marker")
    match = re.search(r"```json\s*(\{.*?\})\s*```", body, flags=re.DOTALL)
    if not match:
        raise ValueError("missing fenced JSON decision payload")
    payload = json.loads(match.group(1))
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def decision_to_plan(decision_path: pathlib.Path, out_path: pathlib.Path):
    decision = load_path(decision_path)
    if decision.get("milestone") is None:
        raise ValueError("decision has no milestone")
    plan = {
        "version": 1,
        "repository": decision["repository"],
        "roadmap_id": f"product-brain:{decision['decision_id']}",
        "milestone": {
            "id": decision["milestone"]["id"],
            "title": decision["milestone"]["title"],
            "description": decision["milestone"]["description"],
        },
        "tasks": decision["milestone"]["tasks"],
        "extensions": {
            "planner": "product-brain-v1",
            "decision_id": decision["decision_id"],
            "action": decision["action"],
            "success_metric": decision["success_metric"],
            "confidence": decision["confidence"],
            "risk": decision["risk"],
        },
    }
    validate_schema(plan, "factory-milestone-plan.schema.json")
    semantic_validate_tasks(plan["tasks"])
    out_path.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
        raise SystemExit(
            "usage: validate-planning.py <roadmap|plan|state|telemetry|decision|extract-decision|decision-plan|next-index|task-order> ..."
        )
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
    if command in {"state", "telemetry", "decision"} and len(sys.argv) in {3, 4}:
        target = pathlib.Path(sys.argv[2])
        expected = sys.argv[3] if len(sys.argv) == 4 else None
        {"state": validate_state, "telemetry": validate_telemetry, "decision": validate_decision}[command](target, expected)
        print(f"{command} validation passed: {target}")
        return
    if command == "extract-decision" and len(sys.argv) == 4:
        extract_decision(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
        return
    if command == "decision-plan" and len(sys.argv) == 4:
        decision_to_plan(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
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

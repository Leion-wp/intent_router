#!/usr/bin/env python3
import json
import math
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


def worker_capacity_contract():
    contract = load("factory-worker-capacity.json")
    if contract.get("version") != 1:
        raise ValueError("unsupported worker capacity contract version")
    jules = contract.get("workers", {}).get("jules", {})
    planning = contract.get("planning", {})
    max_concurrency = jules.get("max_concurrency")
    threshold = planning.get("parallel_threshold")
    multiplier = planning.get("issue_multiplier")
    floor = planning.get("minimum_issues_floor")
    max_issues = planning.get("max_issues_per_milestone")
    if not isinstance(max_concurrency, int) or not 1 <= max_concurrency <= 15:
        raise ValueError("Jules max_concurrency must be an integer in 1..15")
    if not isinstance(threshold, int) or threshold < 1:
        raise ValueError("parallel_threshold must be a positive integer")
    if not isinstance(multiplier, (int, float)) or multiplier < 1:
        raise ValueError("issue_multiplier must be >= 1")
    if not isinstance(floor, int) or floor < 1:
        raise ValueError("minimum_issues_floor must be a positive integer")
    if not isinstance(max_issues, int) or max_issues < floor:
        raise ValueError("max_issues_per_milestone must be >= minimum_issues_floor")
    return contract


def dynamic_minimum_task_count(contract=None):
    contract = contract or worker_capacity_contract()
    max_concurrency = contract["workers"]["jules"]["max_concurrency"]
    planning = contract["planning"]
    floor = planning["minimum_issues_floor"]
    if max_concurrency <= planning["parallel_threshold"]:
        return floor
    return max(floor, math.ceil(max_concurrency * planning["issue_multiplier"]))


def dependency_layer_widths(tasks):
    by_id = {task["id"]: task for task in tasks}
    done = set()
    widths = []
    while len(done) < len(by_id):
        ready = sorted(
            task["id"]
            for task in by_id.values()
            if task["id"] not in done and set(task["blocked_by"]) <= done
        )
        if not ready:
            raise ValueError(f"circular dependency among: {sorted(set(by_id) - done)}")
        widths.append(len(ready))
        done.update(ready)
    return widths


def validate_dynamic_parallelism(tasks):
    contract = worker_capacity_contract()
    max_concurrency = contract["workers"]["jules"]["max_concurrency"]
    max_issues = contract["planning"]["max_issues_per_milestone"]
    minimum = dynamic_minimum_task_count(contract)
    if len(tasks) < minimum:
        raise ValueError(
            f"dynamic milestone requires at least {minimum} tasks for Jules capacity {max_concurrency}; got {len(tasks)}"
        )
    if len(tasks) > max_issues:
        raise ValueError(f"dynamic milestone exceeds configured maximum of {max_issues} tasks")
    initially_ready = sum(1 for task in tasks if not task["blocked_by"])
    required_frontier = min(max_concurrency, len(tasks))
    if initially_ready < required_frontier:
        raise ValueError(
            f"dynamic milestone initial parallel frontier requires at least {required_frontier} unblocked tasks; got {initially_ready}"
        )


def validate_program_milestone(decision):
    milestone = decision.get("milestone")
    transition = decision["program"]["transition"]
    if milestone is None:
        if transition not in {"COMPLETE", "PAUSE"}:
            raise ValueError(f"program transition {transition} requires a milestone")
        return

    if transition not in {"START", "CONTINUE", "ADAPT"}:
        raise ValueError(f"program transition {transition} must not materialize a milestone")

    declared_workstreams = [item["id"] for item in decision["program"]["workstreams"]]
    if len(declared_workstreams) != len(set(declared_workstreams)):
        raise ValueError("duplicate program workstream identities")
    used_workstreams = []
    for task in milestone["tasks"]:
        workstream = task.get("workstream")
        if not workstream:
            raise ValueError(f"dynamic program task {task['id']} is missing workstream")
        if workstream not in declared_workstreams:
            raise ValueError(f"task {task['id']} references undeclared workstream {workstream}")
        used_workstreams.append(workstream)
    unused = sorted(set(declared_workstreams) - set(used_workstreams))
    if unused:
        raise ValueError(f"program workstreams without milestone work: {unused}")

    actual_width = dependency_layer_widths(milestone["tasks"])
    expected_width = milestone["planning"]["expected_ready_width"]
    if expected_width != actual_width:
        raise ValueError(
            f"expected ready-width profile {expected_width} does not match dependency layers {actual_width}"
        )

    max_concurrency = worker_capacity_contract()["workers"]["jules"]["max_concurrency"]
    sustained_floor = min(5, max_concurrency)
    severe_layers = []
    for index, width in enumerate(actual_width[:-1]):
        if width >= sustained_floor:
            continue
        remaining = sum(actual_width[index + 1 :])
        if index < len(actual_width) - 2 or remaining >= sustained_floor:
            severe_layers.append((index + 1, width))
    rationale = milestone["planning"]["narrowing_rationale"].strip()
    if severe_layers and len(rationale) < 20:
        raise ValueError(
            "severe sustained ready-width collapse requires a bounded narrowing rationale: "
            f"{severe_layers}"
        )


def schema_store():
    names = (
        "factory-roadmap.schema.json",
        "factory-issue-plan.schema.json",
        "factory-milestone-plan.schema.json",
        "factory-planning-result.schema.json",
        "factory-product-state.schema.json",
        "factory-product-decision.schema.json",
        "factory-product-telemetry.schema.json",
        "factory-program-state.schema.json",
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
        text = " ".join([task["title"]] + task["scope"] + task["acceptance_criteria"] + task["done"])
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


def validate_program_state(path: pathlib.Path, expected_repo: str | None = None):
    state = load_path(path)
    validate_schema(state, "factory-program-state.schema.json")
    if expected_repo and state["repository"] != expected_repo:
        raise ValueError(f"program state repository mismatch: {state['repository']} != {expected_repo}")


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
    product_context = decision["product_context"]
    context_values = [value for value in product_context.values() if isinstance(value, str)]
    program = decision["program"]
    program_text = [
        program["title"],
        program["strategic_objective"],
        program["success_metric"],
        *program["learnings"],
    ]
    program_text.extend(item["title"] + " " + item["objective"] for item in program["workstreams"])
    program_text.extend(
        item["title"] + " " + item["objective"] for item in program["candidate_next_milestones"]
    )
    reject_forbidden_text(
        " ".join(
            [
                decision["objective"],
                decision["hypothesis"],
                decision["success_metric"],
                *context_values,
                *program_text,
                decision["human_gate"]["reason"],
            ]
            + decision["evidence"]
        ),
        f"decision {decision['decision_id']}",
    )
    milestone = decision.get("milestone")
    if milestone:
        reject_forbidden_text(milestone["title"] + " " + milestone["description"], f"decision {decision['decision_id']} milestone")
        semantic_validate_tasks(milestone["tasks"])
        validate_dynamic_parallelism(milestone["tasks"])
    validate_program_milestone(decision)
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
    milestone = decision["milestone"]
    plan = {
        "version": 1,
        "repository": decision["repository"],
        "roadmap_id": f"program:{decision['program']['program_id']}",
        "milestone": {
            "id": milestone["id"],
            "title": milestone["title"],
            "description": milestone["description"],
        },
        "tasks": milestone["tasks"],
        "extensions": {
            "planner": "product-brain-v1",
            "decision_id": decision["decision_id"],
            "repository_role": decision["repository_role"],
            "program_id": decision["program"]["program_id"],
            "program_transition": decision["program"]["transition"],
            "workstreams": [item["id"] for item in decision["program"]["workstreams"]],
            "expected_ready_width": milestone["planning"]["expected_ready_width"],
            "narrowing_rationale": milestone["planning"]["narrowing_rationale"],
            "action": decision["action"],
            "success_metric": decision["success_metric"],
            "confidence": decision["confidence"],
            "risk": decision["risk"],
            "worker_capacity": worker_capacity_contract()["workers"]["jules"]["max_concurrency"],
        },
    }
    validate_schema(plan, "factory-milestone-plan.schema.json")
    semantic_validate_tasks(plan["tasks"])
    validate_dynamic_parallelism(plan["tasks"])
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
            "usage: validate-planning.py <roadmap|plan|state|program-state|telemetry|decision|extract-decision|decision-plan|next-index|task-order> ..."
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
    if command in {"state", "program-state", "telemetry", "decision"} and len(sys.argv) in {3, 4}:
        target = pathlib.Path(sys.argv[2])
        expected = sys.argv[3] if len(sys.argv) == 4 else None
        {
            "state": validate_state,
            "program-state": validate_program_state,
            "telemetry": validate_telemetry,
            "decision": validate_decision,
        }[command](target, expected)
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

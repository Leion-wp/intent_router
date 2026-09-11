#!/usr/bin/env python3
import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent


def read(path):
    with pathlib.Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def write(path, value):
    pathlib.Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def validate_schema(document, schema_name):
    with (ROOT / schema_name).open(encoding="utf-8") as handle:
        schema = json.load(handle)
    jsonschema.Draft202012Validator(schema).validate(document)


def load_existing(path):
    if path == "-":
        return None
    value = read(path)
    validate_schema(value, "factory-program-state.schema.json")
    return value


def validate_profile(profile_path, repo, role):
    profile = read(profile_path)
    validate_schema(profile, "factory-repository-profile.schema.json")
    if profile["repository"] != repo:
        raise ValueError(f"program profile repository mismatch: {profile['repository']} != {repo}")
    if profile["repository_role"] != role:
        raise ValueError(
            f"program profile repository role mismatch: {profile['repository_role']} != {role}"
        )
    return profile


def validate_transition(decision, existing):
    validate_schema(decision, "factory-product-decision.schema.json")
    program = decision["program"]
    transition = program["transition"]
    repo = decision["repository"]
    role = decision["repository_role"]

    if existing:
        if existing["repository"] != repo:
            raise ValueError(f"program repository mismatch: {existing['repository']} != {repo}")
        if existing["repository_role"] != role:
            raise ValueError(
                f"program repository role mismatch: {existing['repository_role']} != {role}"
            )

    if transition == "START":
        if existing and existing["status"] != "COMPLETED":
            raise ValueError("START requires no program or a COMPLETED prior program")
    else:
        if not existing:
            raise ValueError(f"{transition} requires an existing program")
        if existing["program_id"] != program["program_id"]:
            raise ValueError(
                f"program identity mismatch: {existing['program_id']} != {program['program_id']}"
            )
        if transition in {"CONTINUE", "ADAPT", "PAUSE"} and existing["status"] != "ACTIVE":
            raise ValueError(f"{transition} requires ACTIVE program state")
        if transition == "COMPLETE" and existing["status"] not in {"ACTIVE", "PAUSED"}:
            raise ValueError("COMPLETE requires ACTIVE or PAUSED program state")
        if program["title"] != existing["title"]:
            raise ValueError("program title cannot change inside an existing program")
        if program["strategic_objective"] != existing["strategic_objective"]:
            raise ValueError("program strategic objective cannot change inside an existing program")
        if program["success_metric"] != existing["success_metric"]:
            raise ValueError("program success metric cannot change inside an existing program")

    workstream_ids = [item["id"] for item in program["workstreams"]]
    if len(workstream_ids) != len(set(workstream_ids)):
        raise ValueError("duplicate program workstream identities")
    candidate_ids = [item["id"] for item in program["candidate_next_milestones"]]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise ValueError("duplicate candidate milestone identities")

    milestone = decision.get("milestone")
    if transition in {"START", "CONTINUE", "ADAPT"}:
        if milestone is None:
            raise ValueError(f"{transition} requires a milestone")
        if milestone["id"] in candidate_ids:
            raise ValueError("current milestone cannot also be a candidate next milestone")
        task_workstreams = []
        for task in milestone["tasks"]:
            workstream = task.get("workstream")
            if not workstream:
                raise ValueError(f"dynamic program task {task['id']} is missing workstream")
            if workstream not in workstream_ids:
                raise ValueError(
                    f"task {task['id']} references undeclared workstream {workstream}"
                )
            task_workstreams.append(workstream)
        unused = sorted(set(workstream_ids) - set(task_workstreams))
        if unused:
            raise ValueError(f"program workstreams without milestone work: {unused}")
    elif milestone is not None:
        raise ValueError(f"{transition} must not materialize a milestone")

    return program


def validate_decision(decision_path, existing_path, profile_path):
    decision = read(decision_path)
    existing = load_existing(existing_path)
    validate_profile(profile_path, decision["repository"], decision["repository_role"])
    validate_transition(decision, existing)
    return decision


def append_completed(existing, timestamp):
    completed = [] if not existing else list(existing.get("completed_milestones", []))
    if not existing or not existing.get("current_milestone"):
        return completed
    current = existing["current_milestone"]
    if not any(item["id"] == current["id"] for item in completed):
        completed.append(
            {"id": current["id"], "title": current["title"], "completed_at": timestamp}
        )
    return completed


def build_state(decision_path, repo, timestamp, existing_path, profile_path, out_path):
    decision = read(decision_path)
    if decision["repository"] != repo:
        raise ValueError(f"decision repository mismatch: {decision['repository']} != {repo}")
    existing = load_existing(existing_path)
    validate_profile(profile_path, repo, decision["repository_role"])
    program = validate_transition(decision, existing)
    transition = program["transition"]

    completed = append_completed(existing, timestamp) if transition != "START" else []
    prior_learnings = [] if not existing or transition == "START" else existing.get("learnings", [])
    learnings = list(dict.fromkeys([*prior_learnings, *program["learnings"]]))[-30:]

    if transition in {"START", "CONTINUE", "ADAPT"}:
        milestone = decision["milestone"]
        current_milestone = {
            "id": milestone["id"],
            "title": milestone["title"],
            "status": "ACTIVE",
        }
        status = "ACTIVE"
    else:
        current_milestone = None
        status = "PAUSED" if transition == "PAUSE" else "COMPLETED"

    state = {
        "version": 1,
        "program_id": program["program_id"],
        "repository": repo,
        "repository_role": decision["repository_role"],
        "title": program["title"],
        "strategic_objective": program["strategic_objective"],
        "success_metric": program["success_metric"],
        "status": status,
        "current_milestone": current_milestone,
        "candidate_next_milestones": (
            [] if transition == "COMPLETE" else program["candidate_next_milestones"]
        ),
        "workstreams": program["workstreams"],
        "learnings": learnings,
        "completed_milestones": completed,
        "last_decision_id": decision["decision_id"],
        "last_updated": timestamp,
        "extensions": existing.get("extensions", {}) if existing else {},
    }
    validate_schema(state, "factory-program-state.schema.json")
    write(out_path, state)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: factory-program-manager.py <validate|state> ...")
    if sys.argv[1] == "validate" and len(sys.argv) == 5:
        validate_decision(sys.argv[2], sys.argv[3], sys.argv[4])
        print("program decision validation passed")
        return
    if sys.argv[1] == "state" and len(sys.argv) == 8:
        build_state(*sys.argv[2:])
        return
    raise SystemExit("invalid factory program manager command")


if __name__ == "__main__":
    main()

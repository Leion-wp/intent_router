#!/usr/bin/env python3
import json
import pathlib
import sys

PHASE_BY_ACTION = {
    "BUILD": "VALUE",
    "HARDEN": "HARDENING",
    "MEASURE": "MEASURING",
    "PIVOT": "ITERATING",
    "PAUSE": "PAUSED",
    "LAUNCH_READY": "LAUNCH_READY",
}


def read(path: str):
    with pathlib.Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def write(path: str, value):
    pathlib.Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def update_state(decision_path: str, repo: str, timestamp: str, existing_path: str, out_path: str):
    decision = read(decision_path)
    existing = None if existing_path == "-" else read(existing_path)
    name = repo.split("/", 1)[1]
    if existing:
        name = existing.get("product", {}).get("name") or name
    state = {
        "version": 1,
        "repository": repo,
        "planner_mode": "DYNAMIC",
        "product": {
            "name": name,
            "value_proposition": decision["product_context"]["value_proposition"],
            "target_user": decision["product_context"]["target_user"],
        },
        "phase": PHASE_BY_ACTION[decision["action"]],
        "strategy": {
            "current_hypothesis": decision["hypothesis"],
            "success_metric": decision["success_metric"],
            "next_question": decision["product_context"]["next_question"],
        },
        "last_decision": {
            "decision_id": decision["decision_id"],
            "action": decision["action"],
            "applied_at": timestamp,
        },
        "governance": {
            "production_gate": "HUMAN_REQUIRED",
            "credential_gate": "HUMAN_REQUIRED",
            "spend_gate": "HUMAN_REQUIRED",
        },
        "updated_at": timestamp,
        "extensions": existing.get("extensions", {}) if existing else {},
    }
    write(out_path, state)


def telemetry(repo: str, timestamp: str, snapshot_path: str, out_path: str):
    snapshot = read(snapshot_path)
    done = snapshot["done"]
    rework_issue_count = snapshot["rework_issue_count"]
    first_pass = None if done == 0 else max(0.0, min(1.0, (done - rework_issue_count) / done))
    cycles = snapshot.get("cycle_hours", [])
    mean_cycle = None if not cycles else sum(cycles) / len(cycles)
    blocked = snapshot["blocked"]
    queued = snapshot["queued"]
    open_prs = snapshot["open_prs"]
    # Operational score only. Revenue/market signal remains external until connected.
    priority_score = round((queued * 0.5) + (open_prs * 0.25) - (blocked * 2.0), 3)
    value = {
        "version": 1,
        "repository": repo,
        "generated_at": timestamp,
        "flow": {
            "open_issues": snapshot["open_issues"],
            "queued": queued,
            "dispatching": snapshot["dispatching"],
            "dispatched": snapshot["dispatched"],
            "blocked": blocked,
            "done": done,
            "open_milestones": snapshot["open_milestones"],
            "closed_milestones": snapshot["closed_milestones"],
            "open_prs": open_prs,
            "merged_prs": snapshot["merged_prs"],
        },
        "quality": {
            "rework_events": snapshot["rework_events"],
            "blocked_events": snapshot["blocked_events"],
            "first_pass_rate": first_pass,
            "mean_issue_cycle_hours": mean_cycle,
        },
        "portfolio": {
            "external_signal": snapshot.get("external_signal"),
            "revenue_signal": snapshot.get("revenue_signal"),
            "cost_signal": snapshot.get("cost_signal"),
            "priority_score": priority_score,
        },
        "extensions": {
            "source": "github-control-plane-v1",
            "note": "Market, revenue and cost signals remain null until an authorized source supplies them."
        },
    }
    write(out_path, value)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: factory-product-brain.py <state|telemetry> ...")
    if sys.argv[1] == "state" and len(sys.argv) == 7:
        update_state(*sys.argv[2:])
        return
    if sys.argv[1] == "telemetry" and len(sys.argv) == 6:
        telemetry(*sys.argv[2:])
        return
    raise SystemExit("invalid product brain command")


if __name__ == "__main__":
    main()

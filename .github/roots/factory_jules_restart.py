#!/usr/bin/env python3
import json
import pathlib
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
POLICY_PATH = ROOT / "factory-jules-restart-policy.json"


def read_json(path):
    with pathlib.Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def load_policy(path=POLICY_PATH):
    policy = read_json(path)
    if policy.get("version") != 1 or policy.get("worker") != "jules":
        raise ValueError("invalid Jules restart policy identity")
    automatic = policy.get("automatic", {})
    threshold = automatic.get("no_progress_minutes")
    max_restarts = policy.get("max_restarts_per_issue")
    if not isinstance(threshold, int) or threshold < 15:
        raise ValueError("automatic no_progress_minutes must be an integer >= 15")
    if not isinstance(max_restarts, int) or not 1 <= max_restarts <= 5:
        raise ValueError("max_restarts_per_issue must be in 1..5")
    if policy.get("pr_policy") != "REFUSE_IF_OPEN_PR":
        raise ValueError("Jules restart V1 must refuse existing open PRs")
    return policy


def parse_time(value):
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def latest_progress_time(session, activities):
    candidates = []
    for key in ("createTime", "updateTime"):
        parsed = parse_time(session.get(key))
        if parsed:
            candidates.append(parsed)
    for activity in activities.get("activities", []):
        parsed = parse_time(activity.get("createTime"))
        if parsed:
            candidates.append(parsed)
    if not candidates:
        raise ValueError("Jules session has no usable progress timestamp")
    return max(candidates)


def inactivity_minutes(session, activities, now):
    latest = latest_progress_time(session, activities)
    current = parse_time(now)
    if current is None:
        raise ValueError("current time is required")
    seconds = (current - latest).total_seconds()
    return max(0, int(seconds // 60))


def restart_decision(
    *,
    mode,
    state,
    inactivity,
    restart_count,
    has_open_pr,
    blocked,
    human_required,
    escalated,
    policy=None,
):
    policy = policy or load_policy()
    if mode not in {"manual", "automatic"}:
        raise ValueError("restart mode must be manual or automatic")
    if has_open_pr:
        return "refuse_open_pr"
    if blocked or human_required or escalated:
        return "refuse_governance"
    if restart_count >= policy["max_restarts_per_issue"]:
        return "escalate_restart_limit"
    if mode == "manual":
        return "restart"
    if not policy["automatic"]["enabled"]:
        return "noop"
    if state not in policy["automatic"]["eligible_states"]:
        return "noop"
    if inactivity < policy["automatic"]["no_progress_minutes"]:
        return "noop"
    return "restart"


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: factory_jules_restart.py <progress-minutes|decision|validate-policy> ...")
    command = sys.argv[1]
    if command == "validate-policy" and len(sys.argv) == 2:
        load_policy()
        print("Jules restart policy validation passed")
        return
    if command == "progress-minutes" and len(sys.argv) == 5:
        session = read_json(sys.argv[2])
        activities = read_json(sys.argv[3])
        print(inactivity_minutes(session, activities, sys.argv[4]))
        return
    if command == "decision" and len(sys.argv) == 10:
        mode, state = sys.argv[2], sys.argv[3]
        inactivity = int(sys.argv[4])
        restart_count = int(sys.argv[5])
        flags = [value.lower() == "true" for value in sys.argv[6:10]]
        print(
            restart_decision(
                mode=mode,
                state=state,
                inactivity=inactivity,
                restart_count=restart_count,
                has_open_pr=flags[0],
                blocked=flags[1],
                human_required=flags[2],
                escalated=flags[3],
            )
        )
        return
    raise SystemExit("invalid Jules restart helper command")


if __name__ == "__main__":
    main()

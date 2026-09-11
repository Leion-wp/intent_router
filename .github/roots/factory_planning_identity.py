#!/usr/bin/env python3
import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any

MARKER = "<!-- roots-planning-binding:v1 -->"
TRUSTED_AUTHOR = "github-actions[bot]"


class LedgerError(RuntimeError):
    pass


@dataclass(frozen=True)
class Key:
    repository: str
    planner: str
    scope_id: str
    task_id: str


def _payload_from_body(body: str) -> dict[str, Any] | None:
    if MARKER not in body:
        return None
    tail = body.split(MARKER, 1)[1].strip()
    if tail.startswith("```json"):
        tail = tail[len("```json") :]
        if "```" not in tail:
            raise LedgerError("trusted planning binding has unterminated JSON fence")
        tail = tail.split("```", 1)[0].strip()
    elif tail.startswith("```"):
        tail = tail[len("```") :]
        if "```" not in tail:
            raise LedgerError("trusted planning binding has unterminated fence")
        tail = tail.split("```", 1)[0].strip()
    try:
        payload = json.loads(tail)
    except json.JSONDecodeError as exc:
        raise LedgerError(f"trusted planning binding contains invalid JSON: {exc}") from exc
    required = {"version", "repository", "planner", "scope_id", "task_id", "issue_number"}
    missing = required - payload.keys()
    if missing:
        raise LedgerError(f"trusted planning binding missing fields: {sorted(missing)}")
    if payload["version"] != 1:
        raise LedgerError("unsupported planning binding version")
    if not isinstance(payload["issue_number"], int) or payload["issue_number"] <= 0:
        raise LedgerError("planning binding issue_number must be a positive integer")
    for field in ("repository", "planner", "scope_id", "task_id"):
        if not isinstance(payload[field], str) or not payload[field]:
            raise LedgerError(f"planning binding {field} must be a non-empty string")
    return payload


def load_bindings(comments_path: str) -> list[dict[str, Any]]:
    with open(comments_path, "r", encoding="utf-8") as handle:
        comments = json.load(handle)
    if not isinstance(comments, list):
        raise LedgerError("comments payload must be an array")
    bindings: list[dict[str, Any]] = []
    for comment in comments:
        author = ((comment.get("user") or {}).get("login"))
        body = comment.get("body") or ""
        if MARKER not in body:
            continue
        if author != TRUSTED_AUTHOR:
            # Untrusted comments are never authority, even if they perfectly spoof the marker.
            continue
        payload = _payload_from_body(body)
        if payload is not None:
            bindings.append(payload)
    return bindings


def resolve(bindings: list[dict[str, Any]], key: Key) -> int | None:
    matches = [
        item
        for item in bindings
        if item["repository"] == key.repository
        and item["planner"] == key.planner
        and item["scope_id"] == key.scope_id
        and item["task_id"] == key.task_id
    ]
    if not matches:
        return None
    issue_numbers = {item["issue_number"] for item in matches}
    if len(issue_numbers) != 1:
        raise LedgerError(
            f"conflicting canonical planning bindings for {key.repository}/{key.planner}/{key.scope_id}/{key.task_id}: {sorted(issue_numbers)}"
        )
    return next(iter(issue_numbers))


def emit_binding(key: Key, issue_number: int) -> str:
    payload = {
        "version": 1,
        "repository": key.repository,
        "planner": key.planner,
        "scope_id": key.scope_id,
        "task_id": key.task_id,
        "issue_number": issue_number,
    }
    return f"{MARKER}\n```json\n{json.dumps(payload, sort_keys=True, separators=(',', ':'))}\n```"


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    resolve_parser = sub.add_parser("resolve")
    resolve_parser.add_argument("comments")
    resolve_parser.add_argument("repository")
    resolve_parser.add_argument("planner")
    resolve_parser.add_argument("scope_id")
    resolve_parser.add_argument("task_id")

    emit_parser = sub.add_parser("emit")
    emit_parser.add_argument("repository")
    emit_parser.add_argument("planner")
    emit_parser.add_argument("scope_id")
    emit_parser.add_argument("task_id")
    emit_parser.add_argument("issue_number", type=int)

    args = parser.parse_args()
    key = Key(args.repository, args.planner, args.scope_id, args.task_id)
    try:
        if args.command == "resolve":
            issue = resolve(load_bindings(args.comments), key)
            if issue is None:
                return 3
            print(issue)
            return 0
        print(emit_binding(key, args.issue_number))
        return 0
    except LedgerError as exc:
        print(f"PLANNING_IDENTITY_ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

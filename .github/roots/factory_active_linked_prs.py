#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path
from typing import Any


class ActivePrContractError(ValueError):
    pass


def _base_ref(pr: dict[str, Any]) -> str:
    base = pr.get("base")
    if isinstance(base, dict):
        ref = base.get("ref")
        return ref if isinstance(ref, str) else ""
    ref = pr.get("baseRefName")
    return ref if isinstance(ref, str) else ""


def linked_prs(issue: int, prs: list[dict[str, Any]], base: str) -> list[dict[str, Any]]:
    if not isinstance(issue, int) or issue < 1:
        raise ActivePrContractError("issue must be a positive integer")
    if not isinstance(base, str) or not base:
        raise ActivePrContractError("base must be a non-empty string")
    if not isinstance(prs, list):
        raise ActivePrContractError("pull request collection must be an array")

    marker = re.compile(
        rf"(?i)(?:fixes|closes|resolves|refs|references)\s+#{issue}\b"
    )
    matches: list[dict[str, Any]] = []
    seen_numbers: set[int] = set()

    for pr in prs:
        if not isinstance(pr, dict):
            raise ActivePrContractError("pull request collection contains a non-object")
        number = pr.get("number")
        if not isinstance(number, int) or number < 1:
            raise ActivePrContractError("pull request is missing a positive integer number")
        if number in seen_numbers:
            raise ActivePrContractError(f"duplicate pull request number in collection: {number}")
        seen_numbers.add(number)

        if _base_ref(pr) != base:
            continue
        body = pr.get("body") or ""
        if not isinstance(body, str):
            raise ActivePrContractError(f"pull request #{number} body is not a string")
        if marker.search(body):
            matches.append(pr)

    return matches


def _load(path: str) -> list[dict[str, Any]]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ActivePrContractError("pull request collection must be an array")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue", required=True, type=int)
    parser.add_argument("--prs-json", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        matches = linked_prs(args.issue, _load(args.prs_json), args.base)
    except (OSError, json.JSONDecodeError, ActivePrContractError) as exc:
        print(f"ACTIVE_PR_CONTRACT_ERROR: {exc}", flush=True)
        return 2

    rendered = json.dumps(matches, sort_keys=True)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Resolve the latest canonical Roots Quality verdict for one exact PR head."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

VERDICTS = ("PASS", "PASS_WITH_FOLLOW_UP", "REWORK", "BLOCK")
MARKER_RE = re.compile(
    r"<!-- roots-quality-verdict head=(?P<head>[0-9a-fA-F]{40}) "
    r"verdict=(?P<verdict>PASS_WITH_FOLLOW_UP|PASS|REWORK|BLOCK) -->"
)


class VerdictError(RuntimeError):
    pass


class VerdictNoMatch(VerdictError):
    pass


class VerdictConflict(VerdictError):
    pass


def latest_exact_head_verdict(comments: list[dict[str, Any]], head: str) -> dict[str, Any]:
    """Return the latest single verdict marker for ``head`` in canonical comment order.

    GitHub issue comments are consumed in API order. Wake-up event order is irrelevant:
    every reconciliation re-reads this canonical sequence. A single comment that claims
    two different verdicts for the same head is ambiguous and fails closed.
    """
    normalized_head = head.lower()
    latest: dict[str, Any] | None = None

    for index, comment in enumerate(comments):
        if not isinstance(comment, dict):
            continue
        body = str(comment.get("body") or "")
        matches = [
            match
            for match in MARKER_RE.finditer(body)
            if match.group("head").lower() == normalized_head
        ]
        if not matches:
            continue

        verdicts = {match.group("verdict") for match in matches}
        if len(verdicts) != 1:
            raise VerdictConflict(
                f"comment index {index} contains conflicting exact-head Quality verdicts for {head}"
            )

        latest = {
            "head": head,
            "verdict": next(iter(verdicts)),
            "body": body,
            "comment_index": index,
            "comment_id": comment.get("id"),
            "created_at": comment.get("created_at"),
        }

    if latest is None:
        raise VerdictNoMatch(f"no exact-head Quality verdict exists for {head}")
    return latest


def _load_comments(path: str) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text())
    if not isinstance(payload, list):
        raise VerdictConflict("comments JSON must be one canonical array")
    return payload


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--head", required=True)
    parser.add_argument("--comments-json", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = latest_exact_head_verdict(_load_comments(args.comments_json), args.head)
    except VerdictNoMatch as exc:
        print(f"QUALITY_VERDICT_NO_MATCH: {exc}", file=sys.stderr)
        return 2
    except VerdictConflict as exc:
        print(f"QUALITY_VERDICT_CONFLICT: {exc}", file=sys.stderr)
        return 3

    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

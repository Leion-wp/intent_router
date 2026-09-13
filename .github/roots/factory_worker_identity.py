#!/usr/bin/env python3
"""Canonical worker ↔ PR identity validation for Roots factory control-plane gates."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

JULES_RE = re.compile(
    r"<!-- roots-jules-session task_id=(?P<task>\S+) session=(?P<session>sessions/[^ ]+)(?: generation=(?P<generation>[1-9]\d*))? -->"
)
CHATGPT_RE = re.compile(
    r"<!-- roots-chatgpt-worker task_id=(?P<task>\S+) branch=(?P<branch>[^ ]+) pr=(?P<pr>\d+) -->"
)
BODY_REF_RE = re.compile(
    r"(?i)\b(?:fixes|closes|resolves)\s+#(?P<issue>\d+)\b"
)


class IdentityError(RuntimeError):
    pass


class IdentityNoMatch(IdentityError):
    pass


class IdentityConflict(IdentityError):
    pass


def _bodies(comments: list[dict[str, Any]]) -> list[str]:
    return [str(item.get("body") or "") for item in comments if isinstance(item, dict)]


def _extract_identities(repo: str, issue: int, comments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    task_id = f"{repo}#{issue}"
    identities: list[dict[str, Any]] = []
    jules_prefix = f"<!-- roots-jules-session task_id={task_id} "
    for body in _bodies(comments):
        jules_matches = [match for match in JULES_RE.finditer(body) if match.group("task") == task_id]
        if body.count(jules_prefix) != len(jules_matches):
            raise IdentityConflict(f"{task_id} has a malformed Jules worker identity marker")
        for match in jules_matches:
            session = match.group("session")
            token = session.rsplit("/", 1)[-1]
            generation_text = match.group("generation")
            if token:
                identities.append(
                    {
                        "provider": "jules",
                        "session": session,
                        "token": token,
                        "issue": issue,
                        "generation": int(generation_text) if generation_text is not None else None,
                    }
                )
        for match in CHATGPT_RE.finditer(body):
            if match.group("task") != task_id:
                continue
            identities.append(
                {
                    "provider": "chatgpt",
                    "branch": match.group("branch"),
                    "pr": int(match.group("pr")),
                    "issue": issue,
                }
            )

    unique: dict[tuple[Any, ...], dict[str, Any]] = {}
    for identity in identities:
        if identity["provider"] == "jules":
            key = ("jules", identity["session"], identity.get("generation"))
        else:
            key = ("chatgpt", identity["branch"], identity["pr"])
        unique[key] = identity

    deduped = list(unique.values())
    jules = [identity for identity in deduped if identity["provider"] == "jules"]
    chatgpt = [identity for identity in deduped if identity["provider"] == "chatgpt"]
    generated = [identity for identity in jules if identity.get("generation") is not None]
    if generated:
        by_generation: dict[int, dict[str, Any]] = {}
        for identity in generated:
            generation = int(identity["generation"])
            existing = by_generation.get(generation)
            if existing is not None and existing["session"] != identity["session"]:
                raise IdentityConflict(
                    f"{task_id} has multiple Jules sessions for restart generation {generation}"
                )
            by_generation[generation] = identity
        canonical = by_generation[max(by_generation)]
        return [canonical, *chatgpt]
    return deduped


def issue_identity(repo: str, issue: int, comments: list[dict[str, Any]]) -> dict[str, Any]:
    identities = _extract_identities(repo, issue, comments)
    if not identities:
        raise IdentityNoMatch(f"{repo}#{issue} has no persisted worker identity")

    providers = {identity["provider"] for identity in identities}
    if len(providers) > 1:
        raise IdentityConflict(f"{repo}#{issue} has conflicting Jules and ChatGPT worker identities")
    if len(identities) != 1:
        raise IdentityConflict(f"{repo}#{issue} has multiple persisted {next(iter(providers))} identities")
    return identities[0]


def _pr_number(pr: dict[str, Any]) -> int:
    try:
        return int(pr["number"])
    except (KeyError, TypeError, ValueError) as exc:
        raise IdentityConflict("PR number is missing or invalid") from exc


def _pr_branch(pr: dict[str, Any]) -> str:
    if "headRefName" in pr:
        return str(pr.get("headRefName") or "")
    head = pr.get("head")
    if isinstance(head, dict):
        return str(head.get("ref") or "")
    return ""


def _pr_base(pr: dict[str, Any]) -> str:
    if "baseRefName" in pr:
        return str(pr.get("baseRefName") or "")
    base = pr.get("base")
    if isinstance(base, dict):
        return str(base.get("ref") or "")
    return ""


def _pr_draft(pr: dict[str, Any]) -> bool:
    if "isDraft" in pr:
        return bool(pr.get("isDraft"))
    return bool(pr.get("draft"))


def _pr_body(pr: dict[str, Any]) -> str:
    return str(pr.get("body") or "")


def _identity_matches_pr(identity: dict[str, Any], pr: dict[str, Any]) -> bool:
    branch = _pr_branch(pr)
    number = _pr_number(pr)
    if identity["provider"] == "jules":
        token = str(identity.get("token") or "")
        return bool(token) and token in branch
    return branch == identity.get("branch") and number == int(identity.get("pr") or -1)


def _identity_near_matches_pr(identity: dict[str, Any], pr: dict[str, Any]) -> bool:
    """Detect a suspicious ChatGPT branch match with the wrong persisted PR number."""
    if identity["provider"] != "chatgpt":
        return False
    return _pr_branch(pr) == identity.get("branch") and _pr_number(pr) != int(identity.get("pr") or -1)


def _assert_body_correlation(issue: int, pr: dict[str, Any]) -> None:
    refs = {int(match.group("issue")) for match in BODY_REF_RE.finditer(_pr_body(pr))}
    if refs and refs != {issue}:
        joined = ",".join(str(value) for value in sorted(refs))
        raise IdentityConflict(
            f"PR #{_pr_number(pr)} body references issue(s) {joined}, "
            f"but canonical worker identity is {issue}"
        )


def validate_pr(
    repo: str,
    issue: int,
    comments: list[dict[str, Any]],
    pr: dict[str, Any],
    base: str | None = None,
) -> dict[str, Any]:
    if _pr_draft(pr):
        raise IdentityNoMatch(f"PR #{_pr_number(pr)} is draft")
    if base is not None and _pr_base(pr) != base:
        raise IdentityNoMatch(
            f"PR #{_pr_number(pr)} base {_pr_base(pr)!r} does not match canonical base {base!r}"
        )

    identity = issue_identity(repo, issue, comments)
    if not _identity_matches_pr(identity, pr):
        if _identity_near_matches_pr(identity, pr):
            raise IdentityConflict(
                f"{repo}#{issue} ChatGPT marker names PR #{identity['pr']} "
                f"but branch {_pr_branch(pr)!r} belongs to PR #{_pr_number(pr)}"
            )
        raise IdentityNoMatch(
            f"PR #{_pr_number(pr)} branch {_pr_branch(pr)!r} does not match "
            f"{repo}#{issue} {identity['provider']} identity"
        )

    _assert_body_correlation(issue, pr)
    return {
        "status": "ok",
        "repo": repo,
        "issue": issue,
        "provider": identity["provider"],
        "pr": _pr_number(pr),
        "branch": _pr_branch(pr),
        **({"session": identity["session"], "token": identity["token"]} if identity["provider"] == "jules" else {}),
    }


def resolve_pr(
    repo: str,
    pr: dict[str, Any],
    issues: list[dict[str, Any]],
    base: str | None = None,
) -> dict[str, Any]:
    if _pr_draft(pr):
        raise IdentityNoMatch(f"PR #{_pr_number(pr)} is draft")
    if base is not None and _pr_base(pr) != base:
        raise IdentityNoMatch(f"PR #{_pr_number(pr)} does not target {base}")

    matches: list[tuple[int, dict[str, Any]]] = []
    suspicious_conflicts: list[str] = []

    for issue_obj in issues:
        if not isinstance(issue_obj, dict):
            continue
        try:
            issue = int(issue_obj.get("number"))
        except (TypeError, ValueError):
            continue
        comments = issue_obj.get("comments")
        if not isinstance(comments, list):
            comments = []
        identities = _extract_identities(repo, issue, comments)
        if not identities:
            continue

        providers = {identity["provider"] for identity in identities}
        if len(providers) > 1 or len(identities) != 1:
            if any(_identity_matches_pr(identity, pr) or _identity_near_matches_pr(identity, pr) for identity in identities):
                suspicious_conflicts.append(f"{repo}#{issue} has conflicting/ambiguous worker identities")
            continue

        identity = identities[0]
        if _identity_near_matches_pr(identity, pr):
            suspicious_conflicts.append(
                f"{repo}#{issue} ChatGPT marker branch matches PR #{_pr_number(pr)} but persisted pr={identity['pr']}"
            )
            continue
        if _identity_matches_pr(identity, pr):
            matches.append((issue, identity))

    if suspicious_conflicts:
        raise IdentityConflict("; ".join(suspicious_conflicts))
    if not matches:
        raise IdentityNoMatch(
            f"PR #{_pr_number(pr)} branch {_pr_branch(pr)!r} has no canonical persisted worker identity"
        )
    if len(matches) != 1:
        issues_text = ",".join(str(issue) for issue, _ in matches)
        raise IdentityConflict(
            f"PR #{_pr_number(pr)} matches multiple worker identities: {issues_text}"
        )

    issue, identity = matches[0]
    _assert_body_correlation(issue, pr)
    return {
        "status": "ok",
        "repo": repo,
        "issue": issue,
        "provider": identity["provider"],
        "pr": _pr_number(pr),
        "branch": _pr_branch(pr),
        **({"session": identity["session"], "token": identity["token"]} if identity["provider"] == "jules" else {}),
    }


def select_pr(
    repo: str,
    issue: int,
    comments: list[dict[str, Any]],
    prs: list[dict[str, Any]],
    base: str | None = None,
) -> dict[str, Any]:
    identity = issue_identity(repo, issue, comments)
    matching: list[dict[str, Any]] = []
    suspicious: list[str] = []

    for pr in prs:
        if not isinstance(pr, dict) or _pr_draft(pr):
            continue
        if base is not None and _pr_base(pr) != base:
            continue
        if _identity_near_matches_pr(identity, pr):
            suspicious.append(
                f"ChatGPT marker for {repo}#{issue} names PR #{identity['pr']} "
                f"but branch {_pr_branch(pr)!r} is active as PR #{_pr_number(pr)}"
            )
            continue
        if _identity_matches_pr(identity, pr):
            matching.append(pr)

    if suspicious:
        raise IdentityConflict("; ".join(suspicious))
    if not matching:
        raise IdentityNoMatch(f"{repo}#{issue} has no active PR matching its persisted worker identity")
    if len(matching) != 1:
        numbers = ",".join(str(_pr_number(pr)) for pr in matching)
        raise IdentityConflict(f"{repo}#{issue} matches multiple active PRs: {numbers}")

    pr = matching[0]
    _assert_body_correlation(issue, pr)
    result = validate_pr(repo, issue, comments, pr, base)
    head_sha = pr.get("headRefOid")
    if head_sha is None and isinstance(pr.get("head"), dict):
        head_sha = pr["head"].get("sha")
    result["head_sha"] = str(head_sha or "")
    return result


def _load(path: str) -> Any:
    return json.loads(Path(path).read_text())


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    issue = subparsers.add_parser("issue")
    issue.add_argument("--repo", required=True)
    issue.add_argument("--issue", required=True, type=int)
    issue.add_argument("--comments-json", required=True)

    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("--repo", required=True)
    resolve.add_argument("--pr-json", required=True)
    resolve.add_argument("--issues-json", required=True)
    resolve.add_argument("--base")

    select = subparsers.add_parser("select")
    select.add_argument("--repo", required=True)
    select.add_argument("--issue", required=True, type=int)
    select.add_argument("--comments-json", required=True)
    select.add_argument("--prs-json", required=True)
    select.add_argument("--base")

    validate = subparsers.add_parser("validate")
    validate.add_argument("--repo", required=True)
    validate.add_argument("--issue", required=True, type=int)
    validate.add_argument("--comments-json", required=True)
    validate.add_argument("--pr-json", required=True)
    validate.add_argument("--base")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "issue":
            identity = issue_identity(args.repo, args.issue, _load(args.comments_json))
            result = {
                "status": "ok",
                "repo": args.repo,
                "issue": args.issue,
                **identity,
            }
        elif args.command == "resolve":
            result = resolve_pr(args.repo, _load(args.pr_json), _load(args.issues_json), args.base)
        elif args.command == "select":
            result = select_pr(
                args.repo,
                args.issue,
                _load(args.comments_json),
                _load(args.prs_json),
                args.base,
            )
        else:
            result = validate_pr(
                args.repo,
                args.issue,
                _load(args.comments_json),
                _load(args.pr_json),
                args.base,
            )
    except IdentityNoMatch as exc:
        print(f"IDENTITY_NO_MATCH: {exc}", file=sys.stderr)
        return 2
    except IdentityConflict as exc:
        print(f"IDENTITY_CONFLICT: {exc}", file=sys.stderr)
        return 3

    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

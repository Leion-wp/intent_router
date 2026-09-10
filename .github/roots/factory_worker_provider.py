#!/usr/bin/env python3
"""Resolve canonical worker-provider ownership for active factory task identities.

Queued route labels select a provider. Once a task is dispatching/dispatched, the
provider is derived from the persisted reservation/worker identity so later route
label drift cannot free or transfer capacity.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from factory_worker_identity import IdentityConflict, _extract_identities

CHATGPT_ROUTE = "factory:agent:chatgpt"
RESERVATION_RE = re.compile(
    r"<!-- roots-dispatch-request issue=(?P<issue>\d+)\b(?P<meta>[^>]*) -->"
)
WORKER_RE = re.compile(r"\bworker=(?P<provider>jules|chatgpt)\b")


class ProviderError(RuntimeError):
    pass


class ProviderNoMatch(ProviderError):
    pass


class ProviderConflict(ProviderError):
    pass


def _label_names(labels: list[Any]) -> set[str]:
    names: set[str] = set()
    for item in labels:
        if isinstance(item, str):
            names.add(item)
        elif isinstance(item, dict):
            name = item.get("name")
            if name:
                names.add(str(name))
    return names


def _route_provider(labels: list[Any]) -> str:
    return "chatgpt" if CHATGPT_ROUTE in _label_names(labels) else "jules"


def _reservation_providers(issue: int, comments: list[dict[str, Any]]) -> set[str]:
    providers: set[str] = set()
    for comment in comments:
        if not isinstance(comment, dict):
            continue
        body = str(comment.get("body") or "")
        for match in RESERVATION_RE.finditer(body):
            if int(match.group("issue")) != issue:
                continue
            worker = WORKER_RE.search(match.group("meta"))
            if worker:
                providers.add(worker.group("provider"))
    return providers


def resolve_provider(
    repo: str,
    issue: int,
    lifecycle: str,
    labels: list[Any],
    comments: list[dict[str, Any]],
) -> dict[str, Any]:
    route_provider = _route_provider(labels)
    identities = _extract_identities(repo, issue, comments)
    identity_providers = {str(identity["provider"]) for identity in identities}
    if len(identity_providers) > 1 or len(identities) > 1:
        raise ProviderConflict(f"{repo}#{issue} has conflicting or multiple persisted worker identities")

    identity_provider = next(iter(identity_providers), None)
    reservation_providers = _reservation_providers(issue, comments)
    if len(reservation_providers) > 1:
        raise ProviderConflict(f"{repo}#{issue} has conflicting provider reservations")
    reservation_provider = next(iter(reservation_providers), None)

    if lifecycle == "factory:queued":
        if identity_provider is not None:
            raise ProviderConflict(f"{repo}#{issue} is queued but already has persisted worker identity {identity_provider}")
        provider = route_provider
        source = "route"
    elif lifecycle == "factory:dispatching":
        if identity_provider is not None:
            provider = identity_provider
            source = "identity"
        elif reservation_provider is not None:
            provider = reservation_provider
            source = "reservation"
        else:
            raise ProviderNoMatch(f"{repo}#{issue} is dispatching without provider reservation or worker identity")
    elif lifecycle in {"factory:dispatched", "factory:escalated"}:
        if identity_provider is None:
            raise ProviderNoMatch(f"{repo}#{issue} is {lifecycle} without persisted worker identity")
        provider = identity_provider
        source = "identity"
    else:
        raise ProviderNoMatch(f"unsupported lifecycle {lifecycle!r}")

    if identity_provider is not None and reservation_provider is not None and identity_provider != reservation_provider:
        raise ProviderConflict(
            f"{repo}#{issue} reservation provider {reservation_provider} conflicts with identity provider {identity_provider}"
        )

    return {
        "status": "ok",
        "repo": repo,
        "issue": issue,
        "lifecycle": lifecycle,
        "provider": provider,
        "source": source,
        "route_provider": route_provider,
        "route_mismatch": provider != route_provider,
        "reservation_provider": reservation_provider,
        "identity_provider": identity_provider,
    }


def _load(path: str) -> Any:
    return json.loads(Path(path).read_text())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--issue", type=int, required=True)
    parser.add_argument("--lifecycle", required=True)
    parser.add_argument("--labels-json", required=True)
    parser.add_argument("--comments-json", required=True)
    args = parser.parse_args(argv)

    try:
        result = resolve_provider(
            args.repo,
            args.issue,
            args.lifecycle,
            _load(args.labels_json),
            _load(args.comments_json),
        )
    except ProviderNoMatch as exc:
        print(f"PROVIDER_NO_MATCH: {exc}", file=sys.stderr)
        return 2
    except (ProviderConflict, IdentityConflict) as exc:
        print(f"PROVIDER_CONFLICT: {exc}", file=sys.stderr)
        return 3

    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

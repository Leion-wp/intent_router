#!/usr/bin/env python3
"""Resolve native Jules rework admission from the canonical PR Forge routing contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

FORGE_OWNER = "Roots — PR Forge"
SUPPORTED_VERSION = 1
LANE_FLAG = {
    "CI_REWORK": "native_jules_ci_rework",
    "QUALITY_REWORK": "native_jules_quality_rework",
}


class RoutingContractError(ValueError):
    """Raised when the canonical routing contract is malformed or contradictory."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RoutingContractError(message)


def load_contract(path: Path) -> dict[str, Any]:
    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RoutingContractError(f"cannot read valid JSON from {path}: {exc}") from exc

    _require(isinstance(contract, dict), "contract root must be an object")
    _require(contract.get("version") == SUPPORTED_VERSION, "unsupported routing contract version")
    repositories = contract.get("repositories")
    _require(isinstance(repositories, dict), "repositories must be an object")

    for repository, route in repositories.items():
        _require(isinstance(repository, str) and repository, "repository keys must be non-empty strings")
        _require(isinstance(route, dict), f"{repository}: route must be an object")

        lanes = route.get("lanes")
        _require(
            isinstance(lanes, list) and all(isinstance(lane, str) for lane in lanes),
            f"{repository}: lanes must be an array of strings",
        )
        _require(len(lanes) == len(set(lanes)), f"{repository}: lanes must not contain duplicates")

        for lane, flag_name in LANE_FLAG.items():
            _require(
                isinstance(route.get(flag_name), bool),
                f"{repository}: {flag_name} must be a boolean",
            )
            delegated = lane in lanes
            native_enabled = route[flag_name]
            if delegated:
                _require(
                    route.get("technical_rework_owner") == FORGE_OWNER,
                    f"{repository}: {lane} delegation requires technical_rework_owner={FORGE_OWNER!r}",
                )
                _require(
                    native_enabled is False,
                    f"{repository}: {lane} cannot delegate to Forge while native Jules rework is enabled",
                )
            else:
                _require(
                    native_enabled is True,
                    f"{repository}: {flag_name}=false requires {lane} to be delegated",
                )

    return contract


def native_jules_enabled(contract: dict[str, Any], repository: str, lane: str) -> bool:
    flag_name = LANE_FLAG[lane]
    route = contract["repositories"].get(repository)
    if route is None:
        return True
    return bool(route[flag_name])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--routing",
        type=Path,
        default=Path(".github/roots/factory-pr-forge-routing-v1.json"),
    )
    parser.add_argument("--repository", required=True)
    parser.add_argument("--lane", required=True, choices=sorted(LANE_FLAG))
    args = parser.parse_args()

    try:
        contract = load_contract(args.routing)
        enabled = native_jules_enabled(contract, args.repository, args.lane)
    except RoutingContractError as exc:
        print(f"routing contract error: {exc}", file=sys.stderr)
        return 2

    print("true" if enabled else "false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Check the pinned ephemeral Actions runner against the latest public release."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PIN = ROOT / ".github/roots/factory-private-runner-version-v1.json"
LATEST_URL = "https://api.github.com/repos/actions/runner/releases/latest"
ASSET_PREFIX = "actions-runner-linux-x64-"


def parse_time(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def evaluate(pin: dict[str, Any], latest: dict[str, Any], now: dt.datetime) -> tuple[str, int]:
    pinned_tag = "v" + pin["runner_version"]
    latest_tag = latest["tag_name"]
    assets = {asset["name"]: asset for asset in latest.get("assets", [])}

    if latest_tag == pinned_tag:
        asset = assets.get(pin["asset"])
        if not asset:
            return "PIN_ASSET_MISSING", 2
        digest = asset.get("digest")
        if digest != "sha256:" + pin["sha256"]:
            return "PIN_DIGEST_MISMATCH", 2
        return "CURRENT", 0

    published = parse_time(latest["published_at"])
    age_days = (now - published).total_seconds() / 86400
    if age_days >= 21:
        return "UPDATE_REQUIRED", 1
    return "UPDATE_AVAILABLE", 0


def fetch_latest() -> dict[str, Any]:
    request = urllib.request.Request(
        LATEST_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "roots-private-runner-version-watch/1",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pin", type=Path, default=PIN)
    parser.add_argument("--latest-json", type=Path)
    args = parser.parse_args()

    pin = json.loads(args.pin.read_text(encoding="utf-8"))
    latest = (
        json.loads(args.latest_json.read_text(encoding="utf-8"))
        if args.latest_json
        else fetch_latest()
    )
    status, code = evaluate(pin, latest, dt.datetime.now(dt.timezone.utc))

    latest_tag = latest.get("tag_name", "unknown")
    if status == "CURRENT":
        print(f"RUNNER_PIN_CURRENT: {latest_tag}")
    elif status == "UPDATE_AVAILABLE":
        print(
            f"::warning::RUNNER_PIN_UPDATE_AVAILABLE pinned=v{pin['runner_version']} latest={latest_tag}"
        )
    else:
        print(
            f"::error::{status} pinned=v{pin['runner_version']} latest={latest_tag}"
        )
    return code


if __name__ == "__main__":
    raise SystemExit(main())

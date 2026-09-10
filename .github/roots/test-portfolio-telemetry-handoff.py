#!/usr/bin/env python3
"""Regression contract for the event-driven portfolio telemetry refresh handoff."""
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parent
WORKFLOWS = ROOT.parent / "workflows"


def load_workflow(filename: str) -> dict:
    return yaml.safe_load((WORKFLOWS / filename).read_text())


def main() -> None:
    handoff_path = WORKFLOWS / "factory-portfolio-telemetry-handoff.yml"
    handoff_text = handoff_path.read_text()
    handoff = yaml.safe_load(handoff_text)

    source_files = [
        "factory-fleet-watchdog.yml",
        "factory-fleet-scheduler.yml",
        "factory-cross-repo-dispatch.yml",
        "factory-fleet-completion-reconciler.yml",
        "factory-managed-automerge.yml",
        "factory-autonomous-planning.yml",
        "factory-product-brain.yml",
    ]
    expected_names = [load_workflow(filename)["name"] for filename in source_files]
    subscribed_names = handoff["on"]["workflow_run"]["workflows"]

    assert subscribed_names == expected_names, (
        "portfolio telemetry handoff subscriptions drifted from current workflow names: "
        f"expected={expected_names!r} actual={subscribed_names!r}"
    )
    assert "gh workflow run factory-portfolio-telemetry.yml" in handoff_text
    assert '--repo "$GITHUB_REPOSITORY"' in handoff_text, (
        "telemetry handoff must pass --repo explicitly because it intentionally has no checkout"
    )
    assert "--ref Android" in handoff_text

    print("portfolio telemetry handoff tests passed")


if __name__ == "__main__":
    main()

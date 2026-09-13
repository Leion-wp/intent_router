#!/usr/bin/env python3
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
VALIDATOR = ROOT / "validate-planning.py"
WORKFLOWS = ROOT.parent / "workflows"
COLLECTION_HELPER = ROOT / "factory-gh-array-collection.sh"

spec = importlib.util.spec_from_file_location("validate_planning", VALIDATOR)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def expect_rejected(text: str) -> None:
    try:
        module.reject_forbidden_text(text, "regression-test")
    except ValueError:
        return
    raise AssertionError(f"unsafe planning text was accepted: {text!r}")


def assert_paginated_array_helper_contract() -> None:
    assert COLLECTION_HELPER.is_file(), "shared GitHub array pagination helper is missing"
    page_one = [{"id": item} for item in range(1, 61)]
    page_two = [{"id": item} for item in range(61, 121)]
    slurped_pages = json.dumps([page_one, page_two], separators=(",", ":"))
    with tempfile.TemporaryDirectory() as tmp:
        fake_gh = pathlib.Path(tmp) / "gh"
        fake_gh.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "test \"$1\" = api\n"
            "test \"$2\" = --paginate\n"
            "test \"$3\" = --slurp\n"
            "test \"$4\" = 'repos/example/issues?per_page=100'\n"
            f"printf '%s\\n' '{slurped_pages}'\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
        env = dict(os.environ)
        env["PATH"] = f"{tmp}:{env.get('PATH', '')}"
        completed = subprocess.run(
            ["bash", str(COLLECTION_HELPER), "repos/example/issues?per_page=100"],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        normalized = json.loads(completed.stdout)
        assert len(normalized) == 120, "shared helper truncated a logical collection above 100 items"
        assert normalized[0] == {"id": 1}
        assert normalized[-1] == {"id": 120}


def assert_whole_set_consumers_use_shared_helper() -> None:
    contracts = {
        "factory-product-lifecycle.yml": {
            "min_helper_calls": 2,
            "unsafe": [
                'gh api --paginate "repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100" > milestones.json',
                'gh api --paginate "repos/${GITHUB_REPOSITORY}/issues?milestone=${MILESTONE_NUMBER}&state=open&per_page=100" > open.json',
            ],
        },
        "factory-product-telemetry.yml": {
            "min_helper_calls": 5,
            "unsafe": [
                'gh api --paginate "repos/${repo}/issues?state=all&per_page=100" > /tmp/issues.json',
                'gh api --paginate "repos/${repo}/milestones?state=all&per_page=100" > /tmp/milestones.json',
                'comments="$(gh api --paginate "repos/${repo}/issues/${issue}/comments")"',
                'gh pr list --repo "$repo" --state open --limit 100 --json number > /tmp/open-prs.json',
                'gh pr list --repo "$repo" --state merged --limit 100 --json number > /tmp/merged-prs.json',
            ],
        },
        "factory-dynamic-planning-handoff.yml": {
            "min_helper_calls": 1,
            "unsafe": [
                'gh api --paginate "repos/${repo}/milestones?state=all&per_page=100" > /tmp/milestones.json',
            ],
        },
        "factory-fleet-manager.yml": {
            "min_helper_calls": 1,
            "unsafe": [
                'gh api --paginate "repos/${TARGET}/milestones?state=all&per_page=100" > milestones.json',
            ],
        },
        "factory-bootstrap-micro-saas.yml": {
            "min_helper_calls": 1,
            "unsafe": [
                'gh api --paginate "repos/${full_repo}/milestones?state=all&per_page=100" > /tmp/milestones.json',
            ],
        },
    }
    helper = ".github/roots/factory-gh-array-collection.sh"
    for filename, contract in contracts.items():
        text = (WORKFLOWS / filename).read_text(encoding="utf-8")
        assert text.count(helper) >= contract["min_helper_calls"], (
            f"{filename} does not route every owned whole-set collection through {helper}"
        )
        for unsafe in contract["unsafe"]:
            assert unsafe not in text, f"{filename} restored raw paginated whole-set parsing: {unsafe}"

    telemetry = (WORKFLOWS / "factory-product-telemetry.yml").read_text(encoding="utf-8")
    assert 'repos/${repo}/pulls?state=open&per_page=100' in telemetry, (
        "product telemetry must collect the complete open PR set through the shared helper"
    )
    assert 'repos/${repo}/pulls?state=closed&per_page=100' in telemetry, (
        "product telemetry must collect the complete closed PR set before merged filtering"
    )
    assert "select(.merged_at != null)" in telemetry, (
        "product telemetry must distinguish merged PRs from closed-unmerged PRs"
    )


# Positive control-plane mutation language must remain rejected.
expect_rejected("perform production deploy now")
expect_rejected("create secret for the runtime")
expect_rejected("modify .github/workflows/factory.yml")

assert_paginated_array_helper_contract()
assert_whole_set_consumers_use_shared_helper()

# Validate the committed roadmap end-to-end so policy text and fixtures cannot drift silently.
module.validate_roadmap(ROOT / "micro-saas-roadmap-v1.json")
print("planning safety regression tests passed")

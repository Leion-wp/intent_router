import json
import pathlib
import subprocess
import sys
import tempfile


ROOTS = pathlib.Path(__file__).resolve().parent
if str(ROOTS) not in sys.path:
    sys.path.insert(0, str(ROOTS))

from factory_worker_escalation import decide


def test_active_states_never_escalate_from_elapsed_time() -> None:
    for state in ["QUEUED", "PLANNING", "IN_PROGRESS"]:
        assert decide(state, 0, False, False, False) == "none"
        assert decide(state, 0, False, True, False) == "none"


def test_user_feedback_gets_one_bounded_same_session_recovery() -> None:
    assert decide("AWAITING_USER_FEEDBACK", 0, False, False, False) == "recover_feedback"
    assert decide("AWAITING_USER_FEEDBACK", 0, False, True, False) == "escalate"


def test_terminal_or_unexpected_human_states_escalate_without_replacement() -> None:
    for state in ["AWAITING_PLAN_APPROVAL", "PAUSED", "FAILED", "COMPLETED"]:
        assert decide(state, 0, False, False, False) == "escalate"


def test_pr_or_session_output_is_progress_and_prevents_escalation() -> None:
    assert decide("FAILED", 1, False, False, False) == "none"
    assert decide("COMPLETED", 0, True, False, False) == "none"


def test_unknown_state_and_repeated_escalation_fail_closed() -> None:
    assert decide("STATE_UNSPECIFIED", 0, False, False, False) == "none"
    assert decide("SOMETHING_NEW", 0, False, False, False) == "none"
    assert decide("FAILED", 0, False, False, True) == "none"


def test_canonical_issue_identity_cli_selects_latest_restart_generation() -> None:
    comments = [
        {
            "body": "<!-- roots-jules-session task_id=Leion-wp/example#7 session=sessions/S1 -->"
        },
        {
            "body": "<!-- roots-jules-session task_id=Leion-wp/example#7 session=sessions/S2 generation=1 -->"
        },
    ]
    with tempfile.TemporaryDirectory() as directory:
        comments_path = pathlib.Path(directory) / "comments.json"
        comments_path.write_text(json.dumps(comments))
        completed = subprocess.run(
            [
                sys.executable,
                str(ROOTS / "factory_worker_identity.py"),
                "issue",
                "--repo",
                "Leion-wp/example",
                "--issue",
                "7",
                "--comments-json",
                str(comments_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    identity = json.loads(completed.stdout)
    assert identity["provider"] == "jules"
    assert identity["session"] == "sessions/S2"
    assert identity["generation"] == 1


def test_human_quality_rework_receipt_requires_authenticated_jules_activity() -> None:
    workflow = (ROOTS.parent / "workflows" / "factory-quality-block-human-rework.yml").read_text()
    delivered_branch_start = workflow.index(
        'if jq -e --arg marker "$delivered_marker"'
    )
    auth_branch_start = workflow.index(
        'elif jq -e --arg marker "$auth_marker"', delivered_branch_start
    )
    delivered_branch = workflow[delivered_branch_start:auth_branch_start]

    assert "activities?pageSize=100" in delivered_branch
    assert 'grep -Fq "$token" /tmp/activities.json' in delivered_branch
    assert "HUMAN_REWORK_UNPROVEN_RECEIPT" in delivered_branch
    assert delivered_branch.index("activities?pageSize=100") < delivered_branch.index("finalize=true")
    assert "factory_worker_identity.py" in workflow
    assert 'python "$identity_helper" select' in workflow
    assert "--comments-json /tmp/comments.json" in workflow
    assert "--prs-json /tmp/prs.json" in workflow
    assert "canonical Jules ownership" in workflow
    assert "sed -n 's/.* session=" not in workflow


def test_escalated_diagnostics_uses_canonical_issue_identity() -> None:
    workflow = (ROOTS.parent / "workflows" / "factory-escalated-worker-diagnostics.yml").read_text()
    assert "factory_worker_identity.py" in workflow
    assert 'python "$identity_helper" issue' in workflow
    assert "--comments-json /tmp/comments.json" in workflow
    assert "no unambiguous canonical worker identity" in workflow
    assert "sed -n 's/.* session=" not in workflow


def test_legacy_jules_generation_parsers_are_only_collision_deferred() -> None:
    workflows = ROOTS.parent / "workflows"
    legacy_parser = r"session=\([^ ]*\) -->"
    remaining = {
        path.name
        for path in workflows.glob("*.yml")
        if legacy_parser in path.read_text()
    }
    assert remaining == {
        "factory-fleet-completion-reconciler.yml",  # blocked by PR #312
        "factory-fleet-jules-quality-rework.yml",  # blocked by PR #305
        "factory-fleet-jules-rework.yml",  # blocked by PR #305
        "factory-fleet-watchdog.yml",  # blocked by PR #305
    }, remaining


def test_control_plane_wiring_contracts() -> None:
    watchdog = (ROOTS.parent / "workflows" / "factory-fleet-watchdog.yml").read_text()
    scheduler = (ROOTS.parent / "workflows" / "factory-fleet-scheduler.yml").read_text()
    telemetry = (ROOTS.parent / "workflows" / "factory-portfolio-telemetry.yml").read_text()

    assert 'https://jules.googleapis.com/v1alpha/${session}' in watchdog
    assert "AWAITING_USER_FEEDBACK" in watchdog
    assert "roots-worker-watchdog-feedback-recovery" in watchdog
    assert "roots-worker-watchdog-escalation" in watchdog
    assert "factory_worker_escalation.py" in watchdog
    assert "age_seconds" not in watchdog
    assert "--remove-label 'factory:dispatched'" in watchdog
    assert "--add-label 'factory:escalated'" in watchdog
    assert "--add-label 'factory:human-required'" in watchdog

    assert "--label 'factory:escalated'" in scheduler
    assert "--label 'factory:escalated'" in telemetry
    assert "--label 'factory:human-required'" in telemetry


if __name__ == "__main__":
    test_active_states_never_escalate_from_elapsed_time()
    test_user_feedback_gets_one_bounded_same_session_recovery()
    test_terminal_or_unexpected_human_states_escalate_without_replacement()
    test_pr_or_session_output_is_progress_and_prevents_escalation()
    test_unknown_state_and_repeated_escalation_fail_closed()
    test_canonical_issue_identity_cli_selects_latest_restart_generation()
    test_human_quality_rework_receipt_requires_authenticated_jules_activity()
    test_escalated_diagnostics_uses_canonical_issue_identity()
    test_legacy_jules_generation_parsers_are_only_collision_deferred()
    test_control_plane_wiring_contracts()
    print("worker escalation tests passed")

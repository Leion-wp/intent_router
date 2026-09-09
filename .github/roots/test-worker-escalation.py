import pathlib
import sys


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
    test_control_plane_wiring_contracts()
    print("worker escalation tests passed")

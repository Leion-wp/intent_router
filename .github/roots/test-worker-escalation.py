import pathlib
import sys


ROOTS = pathlib.Path(__file__).resolve().parent
if str(ROOTS) not in sys.path:
    sys.path.insert(0, str(ROOTS))

from factory_worker_escalation import decide


def test_post_nudge_timeout_escalates() -> None:
    assert decide(21600, True, False, 0) == "escalate"
    assert decide(30000, True, False, 0) == "escalate"


def test_repeated_reconciliation_is_idempotent() -> None:
    assert decide(21600, True, True, 0) == "none"
    assert decide(99999, True, True, 0) == "none"


def test_no_escalation_before_recovery_or_with_active_pr() -> None:
    assert decide(21599, True, False, 0) == "none"
    assert decide(21600, False, False, 0) == "none"
    assert decide(99999, True, False, 1) == "none"


def test_control_plane_wiring_contracts() -> None:
    watchdog = (ROOTS.parent / "workflows" / "factory-fleet-watchdog.yml").read_text()
    scheduler = (ROOTS.parent / "workflows" / "factory-fleet-scheduler.yml").read_text()
    telemetry = (ROOTS.parent / "workflows" / "factory-portfolio-telemetry.yml").read_text()

    assert "roots-worker-watchdog-escalation" in watchdog
    assert "--remove-label 'factory:dispatched'" in watchdog
    assert "--add-label 'factory:escalated'" in watchdog
    assert "--add-label 'factory:human-required'" in watchdog
    assert "factory_worker_escalation.py" in watchdog

    assert "--label 'factory:escalated'" in scheduler
    assert "--label 'factory:escalated'" in telemetry
    assert "--label 'factory:human-required'" in telemetry


if __name__ == "__main__":
    test_post_nudge_timeout_escalates()
    test_repeated_reconciliation_is_idempotent()
    test_no_escalation_before_recovery_or_with_active_pr()
    test_control_plane_wiring_contracts()
    print("worker escalation tests passed")

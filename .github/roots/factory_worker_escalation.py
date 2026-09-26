import sys


ACTIVE_STATES = {"QUEUED", "PLANNING", "IN_PROGRESS"}
TERMINAL_OR_HUMAN_STATES = {"AWAITING_PLAN_APPROVAL", "PAUSED", "FAILED", "COMPLETED"}


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"invalid boolean: {value}")


def decide(
    session_state: str,
    active_pr_count: int,
    has_output_pr: bool,
    feedback_recovery_sent: bool,
    escalated_before: bool,
) -> str:
    """Return the only recovery transition allowed for an observed Jules state.

    Time is deliberately absent from this decision. A long QUEUED/PLANNING/IN_PROGRESS
    session is still active. The watchdog acts only on explicit Jules state plus durable
    PR/output evidence.
    """
    state = session_state.strip().upper()

    if active_pr_count != 0 or has_output_pr or escalated_before:
        return "none"
    if state in ACTIVE_STATES:
        return "none"
    if state == "AWAITING_USER_FEEDBACK":
        return "escalate" if feedback_recovery_sent else "recover_feedback"
    if state in TERMINAL_OR_HUMAN_STATES:
        return "escalate"
    return "none"


def main() -> None:
    if len(sys.argv) != 6:
        raise SystemExit(
            "usage: factory_worker_escalation.py <session_state> <active_pr_count> "
            "<has_output_pr> <feedback_recovery_sent> <escalated_before>"
        )
    print(
        decide(
            sys.argv[1],
            int(sys.argv[2]),
            _parse_bool(sys.argv[3]),
            _parse_bool(sys.argv[4]),
            _parse_bool(sys.argv[5]),
        )
    )


if __name__ == "__main__":
    main()

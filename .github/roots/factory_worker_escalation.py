import sys


ESCALATION_AFTER_SECONDS = 21600


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"invalid boolean: {value}")


def decide(age_seconds: int, nudged_before: bool, escalated_before: bool, active_pr_count: int) -> str:
    if active_pr_count != 0:
        return "none"
    if age_seconds >= ESCALATION_AFTER_SECONDS and nudged_before and not escalated_before:
        return "escalate"
    return "none"


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: factory_worker_escalation.py <age_seconds> <nudged_before> <escalated_before> <active_pr_count>"
        )
    age_seconds = int(sys.argv[1])
    nudged_before = _parse_bool(sys.argv[2])
    escalated_before = _parse_bool(sys.argv[3])
    active_pr_count = int(sys.argv[4])
    print(decide(age_seconds, nudged_before, escalated_before, active_pr_count))


if __name__ == "__main__":
    main()

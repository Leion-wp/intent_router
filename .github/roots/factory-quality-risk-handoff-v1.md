# Factory Quality risk handoff v1

The Quality verdict and risk classification must become deterministic control-plane state before managed auto-merge.

For a managed `factory:dispatched` issue with one persisted Jules session and exactly one correlated open PR, the reconciler accepts only an exact-head positive Quality marker (`PASS` or `PASS_WITH_FOLLOW_UP`). `PASS` alone never implies LOW_RISK.

The same authoritative Quality comment must explicitly contain `Risk: low`. Only then may the reconciler add `factory:risk-low`. Exact-head `REWORK` or `BLOCK`, denied risk labels, stale heads, ambiguous PR identity, draft PRs, missing sessions, or unclassified risk remain fail-closed.

After reconciliation, the workflow immediately dispatches `factory-managed-automerge.yml`. Auto-merge independently revalidates the LOW_RISK label, exact-head Quality verdict, CI, protected paths, reviews, mergeability and head SHA before merging.

This workflow is an event-handoff target. Scheduled/scanning execution elsewhere remains recovery-only; it must not weaken these gates.

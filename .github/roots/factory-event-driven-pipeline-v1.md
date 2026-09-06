# Event-driven fleet pipeline

Issue: #283. Control plane: `Leion-wp/intent_router`, branch `Android`.

## Primary path

1. An authenticated `repository_dispatch` wakes `factory-fleet-events.yml`.
   The receiver validates the managed repository profile, then dispatches the scheduler.
2. The scheduler requests same-session Quality REWORK reconciliation and Quality
   Risk reconciliation. It does **not** select new work in this phase.
3. Quality Risk re-reads the persisted session, correlated PR and exact-head
   verdict. Only an explicit accepted `Risk: low` materializes `factory:risk-low`.
   After its successful scan, it explicitly dispatches managed auto-merge.
4. Managed auto-merge revalidates its existing gates and, after a successful
   `execute=true` scan, explicitly dispatches completion reconciliation.
5. Completion reconciles merged tasks, including issues GitHub already closed
   with `Fixes #N`. It always dispatches the scheduler with `dispatch_only=true`,
   even when there are zero new completions.
6. That terminal scheduler pass rechecks the global worker lock and selects at
   most one queued task. It never restarts Quality Risk or auto-merge.

All dispatches target `Android`. The distinction between reconciliation and
dispatch is what terminates the chain; there is no completion → full scheduler
→ completion loop. A successful API dispatch is a handoff request, not proof
that the successor has finished. The predecessor exits and the successor owns
its next transition. No timestamp-based run guessing or cron wait is used.

## Recovery and duplicate events

The existing crons remain recovery paths. Explicit dispatch failures fail the
run. A later event or cron can replay the chain. Existing concurrency groups
serialize each stage, and the terminal scheduler re-reads the persisted global
lock before reserving work. Replaying a completed task does not create a new
worker session. Completion markers suppress duplicate comments, never the
remaining state transition. Human-blocked, escalated and NOT_PLANNED tasks
remain excluded. A scheduler dry-run only reads candidates and starts no
mutating reconciliation. Auto-merge dry-runs do not hand off to completion.

## Cross-repository event contract

The receiver accepts these event types:

| Event | Producer transition |
| --- | --- |
| `factory-quality-verdict` | The Quality producer has persisted its verdict comment |
| `factory-ci-completed` | CI has completed on a product PR, with any conclusion |
| `factory-pr-merged` | A product PR has been merged, including a human merge |
| `factory-queue-updated` | The producer has queued work or resolved a blocker |

Send `POST /repos/Leion-wp/intent_router/dispatches` with:

```json
{
  "event_type": "factory-quality-verdict",
  "client_payload": {"repository": "Leion-wp/micro-saas-boilerplate"}
}
```

This payload is only a wake-up hint. It supplies no verdict, label, head SHA,
workflow path, execution flag or permission. The workflows re-read GitHub's
canonical state. A producer must emit **after** persisting its transition;
otherwise the scan may correctly defer until the next event or recovery cron.
CI completion also wakes the existing CI REWORK reconciler. The legacy
`factory-ci-failed` entrypoint remains available.

**Deployment boundary:** `workflow_run` and issue/comment events in a product
repository are not delivered to the control-plane repository. This change
installs the receiver and internal handoffs only. Each external producer needs
an authenticated dispatch to the receiver; a receiver alone cannot observe its
events. At inspection time the boilerplate had only `factory-ci.yml` and no
event relay. Wiring that producer or modifying the Quality automation is a
separate change outside the requested `intent_router` workflow scope. Until
then, external transitions are discovered by the retained cron/manual entrypoint.

The manual `factory-managed-automerge-handoff.yml` remains a recovery entrypoint.
Its old automatic subscription is removed to avoid a second completion dispatch
and to prevent an auto-merge dry-run from waking the execution path.

GitHub semantics: [triggering workflows from workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
`workflow_dispatch` and `repository_dispatch` can be emitted with the control
plane's existing GitHub token; cross-repository emitters need existing authority
to dispatch into the control-plane repository.

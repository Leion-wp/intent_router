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

The receiver accepts these event types through `repository_dispatch`, or through
`workflow_dispatch` inputs `repository` and `event_type` on branch `Android`:

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

**Product relay:** install the reviewed template
`.github/roots/fleet/product-event-relay.yml` as
`.github/workflows/factory-product-event-relay.yml` on the product's default
branch. It observes the four producer transitions above and calls the receiver
via workflow dispatch. It never checks out code or downloads PR artifacts.
The template is tested and linted by the control-plane CI.

Activation order:

1. Merge the receiver's typed `event_type` input into `intent_router@Android`.
2. A human provisions `FACTORY_EVENT_TOKEN` in the product repository: a
   fine-grained PAT or approved GitHub App token scoped to `intent_router` with
   **Actions: write** (plus GitHub's implicit metadata access). Never copy the
   broad `FLEET_GITHUB_TOKEN` into a product. GitHub does not offer a PAT scope
   restricted to one workflow, so keep relay edits under the existing human gate.
3. Merge the product relay. Use its manual replay for a persisted transition
   and verify the receiver and successor run in Actions. Missing credentials or
   a rejected dispatch fail visibly; cron remains the recovery path.

`workflow_run` and issue/comment events stay local to their repository. Installing
a receiver alone is insufficient. The Quality producer needs no new outbound
tool: the product relay observes its persisted source-issue verdict comment.
Native `GITHUB_TOKEN` changes can suppress GitHub Actions triggers; producers
using that token must explicitly dispatch the receiver after their mutation.
The current Product Brain/planning workflows already explicitly dispatch the
scheduler after queue materialization; ordinary external issue events use the relay.

**Quality timing boundary:** at inspection, the ChatGPT Quality Manager runs
hourly. Relaying its published verdict removes the downstream GitHub cron wait,
but does not make verdict generation immediate. Available ChatGPT webhook
triggers do not include CI completion or non-PR issue comments. Full CI → Quality
event-driven execution needs a separately supported Quality trigger/adapter;
this relay does not claim to solve that independent producer scheduling problem.

The manual `factory-managed-automerge-handoff.yml` remains a recovery entrypoint.
Its old automatic subscription is removed to avoid a second completion dispatch
and to prevent an auto-merge dry-run from waking the execution path.

GitHub semantics: [triggering workflows from workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
`workflow_dispatch` and `repository_dispatch` can be emitted with the control
plane's existing GitHub token; cross-repository emitters need existing authority
to dispatch into the control-plane repository.

The product relay uses [workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
so its dedicated credential only needs Actions write access, rather than the
Contents write permission required by repository dispatch.

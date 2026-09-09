# Event-driven fleet pipeline

Control plane: `Leion-wp/intent_router`, branch `Android`.

## Invariants

GitHub is the deterministic control plane. Events are wake-up hints, never authority. Every successor re-reads canonical repository state, profile, session, PR, exact HEAD, labels and gates before mutating anything.

The sequential worker invariant remains unchanged: at most one `factory:dispatching`, `factory:dispatched` or `factory:escalated` task identity is active across the managed fleet. Replays must be idempotent. Human-required, escalated and protected transitions remain fail-closed.

## Primary event path — v2 direct routing

`factory-fleet-events.yml` validates the managed repository profile and routes each persisted transition directly to its owner. It no longer restarts the full scheduler reconciliation loop for every event.

| Persisted event | Direct successor(s) | Purpose |
| --- | --- | --- |
| `factory-pr-active` | `factory-stalled-reconciler.yml` | Reconcile active-PR/stalled state |
| `factory-ci-completed` | `factory-fleet-jules-rework.yml` + `factory-copilot-quality-gate.yml` | Same-session CI repair when needed and immediate native exact-head Quality review |
| `factory-quality-verdict` | `factory-fleet-jules-quality-rework.yml` + `factory-quality-risk-reconciler.yml` | REWORK returns to the same Jules session; accepted explicit low risk can advance to managed merge |
| `factory-pr-merged` | `factory-fleet-completion-reconciler.yml` | Persist completion, release the task identity and advance planning |
| `factory-queue-updated` | `factory-fleet-scheduler.yml` with `dispatch_only=true` | Select at most one eligible queued task without restarting reconciliation |

The two branches of `factory-quality-verdict` are intentionally idempotent. The Quality REWORK reconciler acts only on an exact-head `REWORK`; the risk reconciler fails closed on REWORK/BLOCK/unclassified/stale verdicts and materializes `factory:risk-low` only from an accepted exact-head verdict containing explicit `Risk: low`.

## Terminal execution chain

For a successful managed product change, the nominal path is:

`queued -> dispatch_only -> worker session -> PR -> CI -> native Quality -> Quality Risk -> managed auto-merge -> completion -> planning -> queued -> dispatch_only`

Important boundaries:

1. A dispatch request is not proof that its workflow completed.
2. A Quality PASS does not imply LOW_RISK.
3. LOW_RISK does not bypass CI, protected paths, review, mergeability or human gates.
4. Completion owns release of the current task identity before another worker can be selected.
5. Cron schedules are recovery scans only; they are not the dependency mechanism of the nominal chain.

## Recovery path

The full `factory-fleet-scheduler.yml` execution remains available on cron/manual dispatch as a broad recovery scan. It may reconcile missed Quality REWORK / Quality Risk handoffs, but product events should not invoke that broad path when a more specific successor is known.

Specialized reconciler crons remain fallback for missed events. Their concurrency groups serialize each stage and all mutations must remain idempotent.

## Cross-repository relay contract

Install the reviewed template `.github/roots/fleet/product-event-relay.yml` as `.github/workflows/factory-product-event-relay.yml` on each managed product default branch. It observes only persisted GitHub transitions and dispatches `factory-fleet-events.yml` on `intent_router@Android`.

The relay never checks out PR code, downloads artifacts or executes product code. `FACTORY_EVENT_TOKEN` is human-provisioned and limited to the authority required to dispatch the control-plane workflow. Never copy the broad fleet token into a product repository.

The receiver accepts only:

- `factory-quality-verdict`
- `factory-ci-completed`
- `factory-pr-active`
- `factory-pr-merged`
- `factory-queue-updated`

The payload contains only repository identity and event type. It cannot supply a verdict, risk classification, HEAD, execution permission, workflow path or bypass flag.

## Quality ownership

The GitHub-native `factory-copilot-quality-gate.yml` is the machine producer of exact-head `roots-quality-verdict` comments for managed products. Downstream automation reacts only after that verdict is persisted. External/ChatGPT reviewers may audit it, but must not create a competing machine verdict producer.

The Quality gate itself remains bounded by exact-head evidence and the managed profile. Any inability to establish the required evidence must defer or block rather than invent success.

## Loop termination

There is no event -> full scheduler -> Quality Risk -> auto-merge -> completion -> full scheduler cycle in the nominal path. Event routing targets the known owner, and `dispatch_only` is the terminal selector for newly queued work. This keeps retries local, makes fingerprints meaningful and prevents duplicated fan-out from becoming an implicit scheduler.

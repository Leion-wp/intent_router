# Roots Factory autonomous planning v2

This control plane closes the planning half of the managed micro-SaaS factory without granting the factory authority over credentials, GitHub policy, permissions, production deployment, or unbounded real-money spending.

## State machine

`PRODUCT_ACTIVE -> MILESTONE_PLANNING -> PLAN_VALIDATED -> TASKS_READY -> DISPATCHING -> WORKING -> PR/CI -> DONE -> MILESTONE_READY -> MILESTONE_DONE -> MILESTONE_PLANNING`

The planning controller runs on reconciliation rather than assuming a previous event arrived. Re-running it is expected and must be safe.

## Planning fleet

`factory-autonomous-planning.yml` discovers repositories whose `.factory/profile.json` opts into `roots-micro-saas-v1`. It validates the central roadmap and every selected milestone plan with committed JSON Schemas plus `validate-planning.py`. It reconciles the currently open milestone, closes it only after every required non-PR issue is closed, selects the next roadmap milestone, materializes its dependency graph as GitHub issues, and hands control to the fleet scheduler.

The initial fixed roadmap remains backward compatible. Once it is complete, Product Brain decisions produce capacity-aware dynamic milestones through the same deterministic validation boundary.

## Bounded parallel worker capacity

Worker capacity is declared in `.github/roots/factory-worker-capacity.json`. The current Jules contract is:

- `max_concurrency = 15`
- `parallel_threshold = 3`
- `issue_multiplier = 1.5`
- `minimum_issues_floor = 5`
- `max_issues_per_milestone = 32`

The scheduler is globally serialized only for reservation. It may reserve and dispatch multiple independent task identities in one pass, up to the number of available Jules slots.

Capacity is not identity. These invariants remain independent:

`0 <= dispatching + dispatched <= max_concurrency`

and, for every task identity:

`one issue -> one Jules session -> one branch -> one PR`

An escalated/HUMAN_REQUIRED identity remains blocked against replacement but does not consume an active Jules compute slot.

## Capacity-aware dynamic milestones

When Jules capacity exceeds three, new Product Brain milestones must contain enough work to feed the pool. The deterministic minimum is:

`max(minimum_issues_floor, ceil(max_concurrency * issue_multiplier))`

At the current capacity of 15, that is **23 issues minimum** per new dynamic milestone. In addition, the initial dependency frontier must expose at least `min(max_concurrency, task_count)` unblocked tasks; currently that means at least **15 initially dispatchable tasks**.

This rule applies to newly generated dynamic Product Brain milestones. Historical/fixed roadmap milestones are not retroactively invalidated; they remain deterministic compatibility input until completed or explicitly regenerated through the validated planning path.

## Deterministic gatekeeper

The gatekeeper fails closed on duplicate milestone/task identities, duplicate titles, missing dependencies, self-dependencies, dependency cycles, empty or unbounded task contracts, insufficient dynamic milestone width, insufficient initial parallel frontier, and explicit attempts to mutate workflow/permission/secret/production authority. Every generated issue contains a stable marker:

`<!-- roots-plan-task roadmap=roots-micro-saas-v1 milestone=<id> task=<id> -->`

That marker is the logical identity used to make issue creation idempotent. More than one issue with the same marker is a control-plane anomaly and planning for that repository stops.

## Acknowledged dispatch

Dispatch does not jump directly from `factory:queued` to `factory:dispatched`. The scheduler first atomically reserves selected identities by recording a dispatch-request marker and applying `factory:dispatching`. Independent `factory-cross-repo-dispatch.yml` runs then create Jules sessions concurrently because their GitHub Actions concurrency group is scoped by repository + issue. Each dispatcher persists the authoritative `roots-jules-session` marker before moving its issue to `factory:dispatched`.

A dispatching task with no persisted session after 20 minutes is returned to `factory:queued` rather than being stranded in a false active state.

## Milestone reconciliation

An open milestone is closed only when it contains at least one required issue and every required issue is closed. Empty milestones, multiple simultaneous open milestones, duplicate logical tasks, and impossible dependency mappings create/retain `[FACTORY] Planning blocked` with `factory:blocked` and do not continue mutating the plan.

When queued work exists, planning hands control to the fleet scheduler using the event-driven dispatch path. Completion reconciliation and periodic reconciliation guarantee eventual progress if a handoff event is missed.

## Trust and authority boundaries

AI/worker issue text is task context, never policy. Deterministic workflows and schemas own state transitions. The factory may consume already-provisioned credentials through normal application runtime boundaries but may not inspect, export, create, modify, rotate, or broaden credentials. Workflow changes, repository permissions, production deployment, and real-money authority remain HUMAN_REQUIRED.

The roadmap may create release-readiness documentation and credential manifests containing variable names only. It must never provision secrets or perform production deployment.

## Recovery

All critical transitions are marker-backed and reconciliation-driven. A failed dispatcher returns only its reserved issue to queued. A missing asynchronous dispatch acknowledgement is recovered after 20 minutes. Re-running planning or scheduling does not duplicate milestones, tasks or worker identities. Ambiguous state fails closed instead of guessing.

## Current autonomy boundary

The fixed roadmap planner remains deterministic. Product Brain may propose new dynamic milestones, but the schema, capacity contract, optimistic product-state preconditions and deterministic gatekeeper remain the authority that validates and materializes them. Parallelism increases throughput; it does not expand permissions or reduce human gates.

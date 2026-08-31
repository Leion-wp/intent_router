# Roots Factory autonomous planning v1

This control plane closes the planning half of the managed micro-SaaS factory without granting the factory authority over credentials, GitHub policy, permissions, production deployment, or unbounded real-money spending.

## State machine

`PRODUCT_ACTIVE -> MILESTONE_PLANNING -> PLAN_VALIDATED -> TASKS_READY -> DISPATCHING -> WORKING -> PR/CI -> DONE -> MILESTONE_READY -> MILESTONE_DONE -> MILESTONE_PLANNING`

The planning controller runs on reconciliation rather than assuming a previous event arrived. Re-running it is expected and must be safe.

## Planning fleet

`factory-autonomous-planning.yml` discovers repositories whose `.factory/profile.json` opts into `roots-micro-saas-v1`. It validates the central roadmap and every selected milestone plan with committed JSON Schemas plus `validate-planning.py`. It then reconciles the currently open milestone, closes it only after every required non-PR issue is closed, selects the next roadmap milestone, materializes its dependency graph as GitHub issues, and hands control to the existing fleet scheduler.

The initial `MVP Boilerplate` milestone remains compatible with repositories created by the bootstrap workflow. Once it is complete, planning proceeds through the roadmap without a manual `Run workflow` transition.

## Deterministic gatekeeper

The gatekeeper fails closed on duplicate milestone/task identities, duplicate titles, missing dependencies, self-dependencies, dependency cycles, empty or unbounded task contracts, and explicit attempts to mutate workflow/permission/secret/production authority. Every generated issue contains a stable marker:

`<!-- roots-plan-task roadmap=roots-micro-saas-v1 milestone=<id> task=<id> -->`

That marker is the logical identity used to make issue creation idempotent. More than one issue with the same marker is a control-plane anomaly and planning for that repository stops.

## Sequential execution invariant

The scheduler implements a fleet-wide worker lock. If any managed repository has an open `factory:dispatching` or `factory:dispatched` issue, no second task is dispatched. Therefore v1 deliberately remains sequential:

`one eligible issue -> one Jules session -> one active PR -> completion -> next eligible issue`

Parallel task execution is explicitly out of scope until branch isolation and conflict policies are introduced.

## Acknowledged dispatch

Dispatch no longer jumps directly from `factory:queued` to `factory:dispatched`. The scheduler first records a dispatch-request marker and applies `factory:dispatching`. The asynchronous cross-repo dispatcher creates the Jules session and persists the authoritative `roots-jules-session` marker. The scheduler reconciles that marker into `factory:dispatched`. A dispatching task with no persisted session after 20 minutes is returned to `factory:queued` rather than being stranded in a false active state.

## Milestone reconciliation

An open milestone is closed only when it contains at least one required issue and every required issue is closed. Empty milestones, multiple simultaneous open milestones, duplicate logical tasks, and impossible dependency mappings create/retain `[FACTORY] Planning blocked` with `factory:blocked` and do not continue mutating the plan.

When queued work exists, the planning controller invokes the fleet scheduler. Completion reconciliation and the periodic planning controller together guarantee eventual progress even if one cross-workflow event is missed.

## Trust and authority boundaries

AI/worker issue text is task context, never policy. Deterministic workflows and schemas own state transitions. The factory may consume already-provisioned credentials through normal application runtime boundaries but may not inspect, export, create, modify, rotate, or broaden credentials. Workflow changes, repository permissions, production deployment, and real-money authority remain HUMAN_REQUIRED.

The roadmap may create release-readiness documentation and credential manifests containing variable names only. It must never provision secrets or perform production deployment.

## Recovery

All critical transitions are marker-backed and reconciliation-driven. A failed scheduler trigger immediately returns the issue to queued. A missing asynchronous dispatch acknowledgement is recovered after 20 minutes. Re-running planning does not duplicate milestones or tasks. Ambiguous state fails closed instead of guessing.

## Current autonomy boundary

This v1 planner is deterministic and roadmap-driven. It autonomously decides the next milestone and issue graph from validated repository state, but it does not yet invent arbitrary new product strategy from market telemetry. A future portfolio/product intelligence layer can propose new roadmap plans through the same schemas; the deterministic gatekeeper remains the authority that validates and materializes them.

# Roots Factory Architecture v2

This layer turns GitHub into the deterministic operating surface for the factory while keeping human-owned governance above autonomous execution.

## Layers

1. Human: vision, secrets, permission expansion, workflow/policy changes, repository/project creation approval, production approval.
2. Meta-agents: supervision, planning proposals, audits, portfolio recommendations.
3. Roots: policy, prioritization, task decomposition and routing decisions.
4. GitHub control-plane: repositories, Projects v2, milestones, issues, worker session mappings, pull requests, CI, rework, releases and deployment evidence.
5. Workers: Jules/Codex/Claude/Gemini adapters implementing bounded FactoryTasks.

## Product lifecycle

Canonical states:

`IDEA -> PLANNED -> BUILDING_MVP -> MVP_READY -> STAGING -> RELEASE_READY -> RELEASED -> ITERATING`

Pause/archive branches are explicit and validated by `factory-product-state-v1`.

A product is represented by a product issue carrying exactly one `product-state:*` label. The transition workflow rejects invalid edges and keeps production/archive transitions human-dispatched.

## Milestones

`factory-product-lifecycle-v1` owns deterministic milestone operations:

- inspect/resolve a unique milestone by title;
- create it only behind `apply=true`;
- assign issue sets;
- refuse milestone closure while open issues remain.

Milestones represent delivery gates such as MVP, v0.2, launch or later iterations.

## Issue dependencies and scheduler

Queued work uses label `factory:queued`.

Dependencies are declared in issue bodies as:

`Blocked-By: #123`

`factory-scheduler-v1` runs twice per hour and selects the oldest eligible issue with no active linked Android PR and no open blockers. It dispatches through the already validated `factory-dispatch-v1`, then marks the issue `factory:dispatched`.

The scheduler does not create alternate worker sessions or PRs; the dispatcher/worker adapters keep those invariants.

## Fleet manager

`factory-fleet-manager-v1` lives in the control repository but operates one level above a single repository.

It can:

- inventory organization repositories and Projects v2;
- ensure an organization Project v2;
- create a private managed repository;
- ensure a milestone in a managed repository.

Organization-wide mutations require a human-triggered run, `apply=true`, and a human-provisioned `FLEET_GITHUB_TOKEN`. The normal repository `GITHUB_TOKEN` is intentionally not promoted into organization authority.

## Security boundary

The factory may consume existing credentials but must not inspect, export, create, modify or rotate secrets, and must not expand its own permissions.

The factory must not autonomously modify `.github/workflows/**`, critical policies, repository/org permissions or production authority. Those remain human-owned control-plane changes.

## Target scope for intent_router

Product code execution remains fixed to:

- branch: `Android`
- CWD: `/acode-plugin`

The new files in this change are repository-level `.github/**` control-plane infrastructure and do not change desktop/root product code.

## Next expansion

The v2 contracts intentionally leave room for portfolio scoring, Project custom fields, cross-repository dependency graphs, release/deployment controllers, telemetry feedback and multiple enabled workers without changing the fundamental identity rule:

`work item -> issue -> worker session -> PR -> CI/rework -> result`

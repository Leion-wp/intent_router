# Roots Factory Control Plane v1

## Purpose

Provide a deterministic GitHub control plane around probabilistic workers. GitHub owns lifecycle, validation, locking, permissions and state transitions. AI workers reason and execute only inside an explicit task contract.

## Human boundary

Creating or modifying workflows, permission policies, deployment gates, production credentials, or worker enablement requires explicit human approval. Discovery may be automatic; activation is not.

## Core invariant

One issue = one active FactoryTask = one active worker execution = one active PR.

A worker must never create a second active execution for an issue while another execution or linked PR is active.

## v1 scope

The first increment is intentionally non-dispatching. `factory-dispatch.yml` is a manually triggered contract compiler and validator. It reads one GitHub issue, builds a normalized `FactoryTask`, validates the hard Android/Acode target, applies an issue-scoped concurrency lock, and uploads the task as an artifact.

No Jules, Codex, Claude, Gemini, merge, deployment, label mutation, secret access or repository write is performed by v1.

## FactoryTask

Required fields:

- `version`: contract version (`1`)
- `task_id`: stable identity `<owner>/<repo>#<issue_number>`
- `source.issue_number`
- `source.issue_url`
- `objective`
- `target.repository`
- `target.branch`: must be `Android`
- `target.cwd`: must be `/acode-plugin`
- `worker.requested`: requested worker capability adapter
- `constraints`: hard constraints inherited by every worker
- `state`: initially `DISPATCH_READY`

The contract describes the task, not provider-specific API details.

## FactoryResult

Every future worker adapter must return a `FactoryResult` containing:

- `version`
- `task_id`
- `status`: `SUCCEEDED`, `REWORK`, `BLOCKED`, or `FAILED`
- `worker`
- `summary`
- `artifacts`
- `tests`
- `risks`
- `next_action`

GitHub validates the result before any next state transition.

## State machine

`CANDIDATE -> DISPATCH_READY -> DISPATCHING -> WORKER_RUNNING -> PR_OPEN -> REVIEW -> PASS | REWORK | BLOCKED | FAILED -> MERGED | CLOSED`

v1 stops at `DISPATCH_READY`.

## Deterministic vs probabilistic boundary

Use scripts/workflows for facts and policy: branch, CWD, WIP, locks, duplicate PR checks, checks status, timeouts, retries, permissions and state transitions.

Use AI for ambiguous decisions: interpretation, planning, implementation strategy, review reasoning and prioritization.

Every AI decision must return to a deterministic validator before it can change GitHub state.

## Idempotence

The durable task identity is `repository#issue`. Workflows use an issue-scoped concurrency group and future dispatch adapters must additionally reconcile existing executions and linked PRs before starting a worker.

The `jules` label is not a lifecycle state machine. It may be treated as an intent signal, but must never be removed/reapplied as a retry mechanism.

## Worker registry direction

Workers are adapters behind a generic contract. Future examples: `jules`, `codex`, `claude`, `gemini`, `local`.

A discovered worker can be `DISCOVERED`, `ENABLED`, `DEGRADED`, or `DISABLED`. Only a human can move a newly discovered worker to `ENABLED`.

## v1 acceptance criteria

1. Manual dispatch accepts an issue number and requested worker.
2. The issue must exist and be open.
3. The generated task is stable and machine-readable.
4. Branch is always `Android` and CWD is always `/acode-plugin`.
5. Concurrent runs for the same issue cannot execute simultaneously.
6. The workflow has read-only repository permissions.
7. The workflow performs no external AI dispatch and no GitHub mutation.
8. The generated FactoryTask is uploaded as an artifact for inspection.

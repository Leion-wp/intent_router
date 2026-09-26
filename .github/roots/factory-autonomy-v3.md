# Roots Factory Autonomy v3

## Purpose

This layer removes the idle gap between the fixed `roots-micro-saas-v1` roadmap and the dynamic Product Brain while adding a portfolio-wide operational view.

## Planning ownership

A managed repository starts in deterministic planning mode. `factory-autonomous-planning.yml` owns the fixed roadmap and the existing scheduler/execution fleet owns issue execution.

When every title in `.github/roots/micro-saas-roadmap-v1.json` exists as a closed milestone, no milestone is open, and `.factory/product-state.json` does not yet exist, `factory-dynamic-planning-handoff.yml` creates exactly one `factory:brain-needed` planning signal.

The ChatGPT Factory Product Manager may then publish one `factory:brain-proposal`. `factory-product-brain.yml` validates the proposal against schema, optimistic state preconditions and deterministic task invariants before it may create a milestone or executable issue.

After the first valid Product Brain decision is applied, `.factory/product-state.json` is the persistent dynamic planning state. The fixed roadmap is already complete, so the deterministic planner has no remaining milestone to materialize.

## End-to-end state flow

```text
fixed roadmap
  -> milestone/issues
  -> scheduler
  -> Jules
  -> PR/CI/rework
  -> issue DONE
  -> next fixed milestone
  -> fixed roadmap complete
  -> factory:brain-needed
  -> Product Manager proposal
  -> deterministic Product Brain validation
  -> dynamic milestone/issues
  -> scheduler
  -> Jules
  -> ...
  -> Product Brain decision needed
  -> repeat
```

## Portfolio telemetry

`factory-portfolio-telemetry.yml` maintains one central `[FACTORY] Portfolio telemetry` issue in the control-plane repository. It records only canonical GitHub operational state: managed repositories, planner phase, milestones, queued/active/blocked work, Product Brain demand, human gates, open PRs and global worker-lock state.

It intentionally does not invent market, revenue or spending evidence. Those signals require separately authorized sources.

`idle_without_next_transition` is an autonomy SLO: a repository is degraded when deterministic planning is complete or dynamic planning is active, but no milestone, worker task, Product Brain request/proposal or human gate explains the next transition.

## Invariants

- One global active worker task in sequential v1.
- One logical Product Brain decision proposal at a time per repository.
- Deterministic roadmap must finish before initial dynamic handoff.
- Product Brain mutations are schema/precondition validated.
- Planning issues are never executable worker backlog.
- Missing evidence is represented as missing, never guessed.
- Workflow, secret, credential, permission, production and unrestricted spending authority remains HUMAN_REQUIRED.

## Recovery

Scheduled reconciliation is the recovery mechanism. Re-running handoff or portfolio telemetry is idempotent. Existing `factory:brain-needed`/`factory:brain-proposal` state prevents duplicate handoff issues. Existing scheduler/watchdog/rework workflows remain responsible for execution recovery.

# Roots Factory Control Plane v1

## Purpose

Provide a deterministic GitHub control plane around probabilistic workers.

GitHub owns lifecycle, validation, locking, permissions and state transitions. AI workers reason and execute only inside explicit versioned contracts.

## Architectural rule

**Loose construction -> strict FactoryTask -> free worker execution -> strict FactoryResult.**

Producers may be humans, issues, agents, APIs or future product generators. Workers may use unrelated providers, APIs, CLIs, SDKs or GitHub Actions. The control plane only accepts data crossing its boundaries when it satisfies the versioned contract.

Strict does not mean provider-specific. The strict core is intentionally small and provider-neutral. Optional `extensions` objects provide namespaced evolution without allowing unknown fields to leak into core policy.

## Human boundary

Creating or modifying workflows, permission policies, deployment gates, production credentials, or worker enablement requires explicit human approval.

Discovery may be automatic; activation is not.

A provider found by discovery enters `DISCOVERED`. It cannot become `ENABLED` merely because credentials, a GitHub App or an integration happen to exist.

## Core invariant

One issue = one active FactoryTask = one active worker execution = one active PR.

A worker must never create a second active execution for an issue while another execution or linked PR is active.

## FactoryTask v1

The strict envelope contains:

- stable `task_id` (`owner/repository#issue`)
- source identity
- structured `spec`
- immutable product target
- required capabilities and optional worker preference
- allowed/forbidden actions and human gates
- bounded execution budget
- initial state
- optional namespaced extensions

The current product target is hard-bound to:

- repository: current repository
- branch: `Android`
- CWD: `/acode-plugin`

The task asks for capabilities. It does not encode provider API details.

## WorkerDescriptor v1

Provider activation belongs in the Worker Registry, not FactoryTask.

Each worker declares:

- `worker_id`
- lifecycle status: `DISCOVERED`, `ENABLED`, `DEGRADED`, `DISABLED`
- capabilities
- activation protocol
- official documentation URL
- concrete entrypoint
- activation method
- authentication mode / expected secret name when applicable
- lifecycle support (`start`, `status`, `resume`, `cancel`)

The `activation.documentation` field is the official source describing how the provider is called. `activation.entrypoint` is the actual adapter target (REST URL, action identifier, CLI, SDK or manual handoff).

This is intentionally split from task construction: FactoryTask says **what capability is required**; WorkerDescriptor says **how this worker is activated**.

## Initial registry

The first registry contains:

- `manual`: ENABLED fallback
- `jules`: DISCOVERED; official Jules REST API
- `codex`: DISCOVERED; official OpenAI Codex GitHub Action
- `claude`: DISCOVERED; official Claude Code GitHub Action
- `gemini`: DISCOVERED; official Gemini CLI GitHub Action

No AI worker is enabled by this PR. Enabling one is a separate explicit human policy decision.

Important authentication fact: an existing provider/GitHub integration is not assumed to be reusable by a workflow. Each adapter uses only an officially documented activation/authentication method. The current official Codex GitHub Action uses a provider API key, so a connected Codex Cloud/ChatGPT GitHub integration is not silently treated as equivalent workflow authentication.

## FactoryResult v1

Every adapter returns the same strict envelope:

- contract version and task identity
- `SUCCEEDED`, `REWORK`, `BLOCKED`, or `FAILED`
- worker identity
- summary
- normalized outputs (branch, commit, PR, worker execution id/url)
- evidence including tests/checks
- risks
- deterministic `next_action`
- optional namespaced extensions

Provider prose cannot directly mutate GitHub state. It must first be normalized into FactoryResult and validated.

## State machine

`CANDIDATE -> DISPATCH_READY -> DISPATCHING -> WORKER_RUNNING -> PR_OPEN -> REVIEW -> PASS | REWORK | BLOCKED | FAILED -> MERGED | CLOSED`

State transitions are control-plane facts, not prompts.

## Deterministic vs probabilistic boundary

Use workflows/scripts for branch, CWD, WIP, locks, duplicate-PR checks, checks status, budgets, timeouts, retries, permissions, provider enablement and state transitions.

Use AI for interpretation, planning, implementation strategy, review reasoning and prioritization.

Every AI result returns to deterministic validation before the control plane can act on it.

## Idempotence

Durable task identity is `repository#issue`.

The dispatcher uses an issue-scoped GitHub Actions concurrency group. Provider adapters must reconcile existing executions/PRs before creating replacement work.

The `jules` label is an intent signal, not a lifecycle state machine, and must never be removed/reapplied as a retry mechanism.

## Workflow fleet in this increment

- `factory-dispatch.yml`: compile, validate, route, concurrency lock and explicit execution gate
- `factory-worker-discovery.yml`: audit registry and activation metadata
- `factory-worker-jules.yml`: Jules REST adapter
- `factory-worker-codex.yml`: Codex Action adapter
- `factory-worker-claude.yml`: Claude Code Action adapter
- `factory-worker-gemini.yml`: Gemini CLI Action adapter
- `factory-result-validate.yml`: strict FactoryResult validator
- existing `acode-regression.yml`: product regression CI

The provider adapters are wired but unreachable while their registry status remains `DISCOVERED`.

## Safety defaults

- no provider automatically changes from DISCOVERED to ENABLED
- workflow/policy modification remains human-gated
- `main.modify` is forbidden in FactoryTask policy
- product scope remains Android + `/acode-plugin`
- execute defaults to false
- provider credentials are referenced only by secret name and are never placed in FactoryTask
- unknown provider-specific data belongs under `extensions`

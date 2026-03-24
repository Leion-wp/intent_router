# Leion Delivery Control Plane V1

## Goal

Sell `Leion Delivery` as a hybrid SaaS product without pretending the runtime is already a full remote platform.

- `Leion Roots` stays the open-core local builder and execution surface.
- `Leion Delivery Control Plane` becomes the paid cloud layer for templates, governance, run visibility, and customer operations.
- Execution remains local-first through VS Code or a lightweight runner agent.

## Product Boundary

### Open-core

- VS Code extension
- visual pipeline builder
- local pipeline execution
- local history and review loop
- delivery template JSON files in `pipeline/product-1/`

### Paid control plane

- organization and workspace management
- repo connection catalog
- template catalog and rollout state
- hosted webhook ingress and routing
- centralized run history, approvals, and exports
- policy packs and governed defaults
- billing, onboarding, and support workflows

## Minimal Cloud Entities

- `organization`
  - billing owner and commercial account boundary
- `workspace`
  - one customer operating surface, usually one team or repo group
- `repo_connection`
  - GitHub repository metadata and webhook binding
- `pipeline_template`
  - reusable workflow definition mapped to a local `.intent.json`
- `run`
  - centralized execution record with status, approvals, logs, and artifacts
- `policy_pack`
  - review and execution guardrails
- `secret`
  - BYO AI key or integration secret metadata
- `billing_account`
  - plan, quota, and invoicing state
- `runner`
  - local VS Code extension instance, CLI agent, or private runner

## Core Contracts

### Auth

- start with `API key`
- support `OAuth device flow` when the product needs multi-user onboarding
- do not block initial pilots on SSO

### Upstream sync

The local runtime or agent pushes:

- pipeline definitions and template metadata
- run status and timestamps
- approval checkpoints and reviewer decisions
- execution logs and exported artifacts
- policy snapshots used at run time

### Runner contract

The runner:

- registers itself with workspace and capability metadata
- polls or leases a job
- executes locally against the repo and local tools
- streams logs and step status back to the control plane
- returns approvals, artifacts, and final outcome

### Hosted webhook ingress

The control plane:

- receives GitHub or external webhook events
- resolves workspace, repo, and template policy
- creates a run record
- notifies a local runner to execute

## Delivery Sequence

### Days 0 to 30

- publish `Leion Delivery` offer, landing copy, pricing, and pilot scope
- keep the product story narrow around software delivery workflows
- sell the `Founding Pilot` manually and prove the workflow pack on real repos

### Days 30 to 90

- ship cloud auth
- ship hosted template catalog and centralized run history
- ship hosted webhook relay
- ship policy pack storage and run export
- keep execution local-first

### Days 90 to 180

- ship `Starter` and `Growth` beta packaging
- add quotas and billing state
- add a lightweight installable runner agent
- prepare enterprise controls like RBAC, SSO, and private runner support

## Acceptance Criteria

- a customer can connect one org, one workspace, and one repo
- the customer can import the three `Leion Delivery` templates
- a local run appears in a hosted dashboard with status, approvals, and artifacts
- a hosted webhook can trigger a governed local run
- billing remains repo/workflow based, not seat based

## Non-goals For V1

- no pure multi-tenant remote code execution
- no seat-based AI assistant pricing
- no generic no-code workflow positioning
- no broad multi-IDE expansion before customer proof exists

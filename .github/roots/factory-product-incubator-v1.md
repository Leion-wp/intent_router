# Factory Product Incubator v1

## Purpose

This layer connects product discovery to the existing repository bootstrap while preserving repository creation as an explicit human authority boundary.

## Proposal contract

A new-product candidate lives as an issue in `Leion-wp/intent_router` with label `factory:new-product-proposal`. The body contains exactly:

```text
<!-- roots-new-product-proposal:v1 -->
```

followed by one fenced JSON object conforming to `.github/roots/factory-new-product-proposal.schema.json`.

The contract carries product problem, target user, hypothesis, success metric, validation plan, evidence, complexity/risk and a bounded budget request. `budget_request_eur` is informational only and never authorizes spending.

## Human repository-creation gate

Every valid proposal requires `human_gate.action = CREATE_REPOSITORY`. The incubator adds `factory:human-required` and explains the proposed private repository and experiment.

Only a human-applied `factory:repo-create-approved` label authorizes the incubator to dispatch the already approved `factory-bootstrap-micro-saas.yml` workflow with `apply=true`.

That approval means only “create this repository from the approved blueprint”. It does not authorize production deployment, external credentials, permission expansion or spending.

## Idempotence

- A proposal ID/repository identity may appear only once.
- An existing valid managed repository is reconciled as completed instead of recreated.
- An existing non-managed repository with the same name is a control-plane anomaly and blocks.
- `factory:bootstrap-requested` prevents repeated bootstrap dispatches.
- A bootstrap request that remains unresolved for more than one hour is marked blocked instead of being spammed repeatedly.

## Handoff

After the target repository exists with a valid `.factory/profile.json`, the proposal is marked `factory:incubated` and closed. From there the deterministic planning, scheduler, Jules, CI/rework, Quality Manager and managed auto-merge loops own delivery.

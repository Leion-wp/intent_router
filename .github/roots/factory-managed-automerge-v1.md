# Managed Product Auto-Merge v1

## Why

The execution loop was autonomous through CI repair and completion reconciliation, but still depended on a human pressing Merge for ordinary managed product PRs. This controller closes that gap without giving autonomous code authority over the control-plane or production.

## Eligible scope

Auto-merge applies only to repositories that:

- are not the control-plane repository;
- have a valid managed `.factory/profile.json`;
- use an allowed blueprint from `.github/roots/factory-managed-merge-policy.json`;
- have an open source issue in `factory:dispatched` with a persisted worker session;
- correlate to exactly one non-draft PR targeting the profile default branch.

## CI gate

For the exact PR head SHA:

- at least one pull-request Actions run must exist;
- every pull-request run must be completed;
- every run conclusion must be allowed by the human-owned merge policy;
- every job named in `.factory/profile.json -> ci.required_jobs` must exist and have latest conclusion `success`.

A missing, queued, failing, ambiguous or stale signal defers merge. It does not get guessed into PASS.

## Protected paths

The human-owned policy denies automatic merge when a product PR touches protected control-plane/governance paths such as `.github/workflows/`, `.github/actions/`, `.github/CODEOWNERS`, `.factory/profile.json` or `.factory/credential-requirements.json`.

This is a second enforcement boundary even though worker prompts already forbid those edits.

## Identity and idempotence

PR correlation prefers explicit issue references and falls back to the persisted Jules session ID in the worker branch. More than one candidate is a `CONTROL_PLANE_ANOMALY` and fails closed.

The merge request is pinned to the observed head SHA. A moving PR cannot be accidentally merged from stale validation. Once merged, the existing completion reconciler owns issue closure and next-task scheduling.

## Human boundary

This controller never merges `Leion-wp/intent_router` control-plane PRs. It never deploys production, changes workflows, secrets, credentials, permissions or policy. Those remain `HUMAN_REQUIRED`.

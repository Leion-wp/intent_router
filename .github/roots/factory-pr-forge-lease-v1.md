# PR Forge atomic lease v1

Control plane: `Leion-wp/intent_router@Android`.

## Purpose

`Roots — PR Forge` is a privileged cognitive writer on existing Jules product PR branches. The event-driven Forge task and `Roots — PR Forge Reconciliation` are two wake-up surfaces for the same writer role, not two independent mutation owners.

Exactly one Forge sweep may mutate product PRs at a time. GitHub is the canonical coordination store. PR comments are audit projections only and never establish exclusivity.

## Canonical lease store

The lease is stored outside `Android` so normal lease churn never changes the control-plane branch:

- repository: `Leion-wp/intent_router`
- branch: `factory-lock/pr-forge`
- path: `.github/roots/state/pr-forge-lease.json`
- resource: `roots-pr-forge`
- default TTL: 120 minutes

The state shape is governed by `.github/roots/factory-pr-forge-lease.schema.json`.

## Atomic acquisition

A Forge invocation must acquire the lease before its first product mutation.

1. Fetch the canonical lease file from `factory-lock/pr-forge` and retain both its parsed state and the exact GitHub content/blob SHA returned by the read.
2. A non-expired `HELD` lease is owned by another invocation. Exit without any product mutation.
3. A `FREE` or expired lease may be contested. Build a candidate `HELD` state with:
   - `generation = previous generation + 1`;
   - the actual Work task id in `holder_task_id`;
   - a fresh non-secret `lease_token`;
   - `acquired_at` and `expires_at` in UTC.
4. Replace the lease file using GitHub Contents API with the exact blob SHA observed in step 1 as the update precondition.
5. Any conflict, stale-SHA error, permission failure or ambiguous result means **lease not acquired**. Do not retry blindly and perform zero product writes.
6. Re-fetch the lease. The invocation owns it only if `state=HELD`, `holder_task_id`, `lease_token`, `generation` and expiry all match the candidate. Record the current lease blob SHA as the fencing version.

The GitHub content SHA is the compare-and-swap boundary: two invocations that read the same prior state cannot both successfully replace it.

## Fencing before every product write

Acquisition is not transferable. Immediately before every commit/file update/push or equivalent mutation on a Jules product branch, re-fetch the canonical lease and require all of:

- `state == HELD`;
- holder task id equals this invocation;
- token equals this invocation;
- generation equals this invocation;
- lease is not expired;
- current lease blob SHA equals this invocation's fencing version.

If any condition fails, stop that PR transaction and perform no further product mutation. Never force-push around a lost fence. Existing per-PR HEAD/base/scope/human-gate checks still apply independently.

An expired lease gives the former holder no authority even when nobody has taken it over yet.

## Renewal

A holder may renew before expiry only by performing another conditional GitHub file update against its current fencing SHA while preserving holder, token and generation and changing only the expiry/audit timestamp fields. After re-fetch and verification, the newly returned/current blob SHA becomes the new fencing version.

Renewal is optional; it must never be used after expiry or after a fence mismatch.

## Release

At the end of a sweep, re-fetch the lease and verify the same holder/token/generation/fencing SHA. Release with one conditional update against that exact SHA:

- set `state=FREE`;
- preserve `generation`;
- clear `holder_task_id`, `lease_token`, `acquired_at`, `expires_at`;
- set `released_at` for audit.

A failed or ambiguous release is not a reason to mutate more product state. The TTL provides crash recovery.

## Shared writer contract

Both the event-driven `Roots — PR Forge` task and `Roots — PR Forge Reconciliation` must use this exact lease resource, CAS acquisition and fencing rules. Reconciliation is recovery only and may never create a second lane.

The lease coordinates product writes only. It does **not**:

- create or replace a Jules/ChatGPT worker identity;
- authorize a new branch or PR;
- publish `roots-quality-verdict`;
- assign `factory:risk-low`;
- bypass CI, review, human gates or merge policy;
- authorize secrets, permissions, providers, billing or production changes.

Native Quality/Risk/merge remain independent authorities.

## Event semantics

A wake-up payload remains only a hint. After acquiring the lease, Forge rebuilds the whole admissible Jules PR batch from live GitHub state. A wake-up for one PR never restricts the sweep to that PR.

PR opened/ready/commit-update wake-ups and periodic reconciliation share this lease immediately. Direct Work wake-ups for `factory-ci-completed` and `factory-quality-verdict` remain a separate event-delivery concern until the Work trigger surface exposes a safe direct route; the lease must not be weakened to compensate.

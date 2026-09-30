# PR Forge atomic write lease v2

Control plane: `Leion-wp/intent_router@Android`.

## Purpose

`Roots — PR Forge` is a privileged cognitive writer on existing Jules product PR branches. The event-driven Forge task and `Roots — PR Forge Reconciliation` are wake-up surfaces for the same logical writer role, not independent mutation owners.

GitHub is the canonical coordination store. PR comments and receipts are audit projections only and never establish exclusivity.

Version 2 narrows the lease to the smallest critical section that needs exclusivity: **one exact product write transaction**. Batch discovery, inspection, diagnosis and planning happen without holding the lease. This reduces stale-lock exposure and keeps the write fence tied to one `{repository, pr, expected_head}`.

## Canonical lease store

- repository: `Leion-wp/intent_router`
- branch: `factory-lock/pr-forge`
- path: `.github/roots/state/pr-forge-lease.json`
- resource: `roots-pr-forge`
- default TTL: 120 minutes
- schema: `.github/roots/factory-pr-forge-lease.schema.json`

The TTL limits how long an existing holder may keep mutation authority. **TTL expiry is never an automatic takeover mechanism.**

## State model

The only states are `FREE` and `HELD`.

- `FREE`: no Forge invocation has product-write authority.
- `HELD`: exactly one Forge invocation may attempt exactly one product write transaction bound to the recorded repository, PR and expected product HEAD.

A `HELD` lease may be acquired only from `FREE`. An expired `HELD` lease is `FORGE_LEASE_STRANDED`; automation must fail closed and require explicit reconciliation of the canonical lease. A new invocation must never infer holder death from time, task schedule, silence, comments, receipts or a reusable task id.

This intentionally removes the v1 rule `expired => contestable`. Product writes and lease writes are separate GitHub mutations, so expiry alone cannot safely fence a holder that passed its final check and then paused before the product write.

## Atomic acquisition

A Forge invocation acquires only when it has already selected one admissible product mutation and has revalidated the exact product HEAD.

1. Fetch the canonical lease from `factory-lock/pr-forge` and retain its parsed state plus exact GitHub content/blob SHA.
2. If `state=HELD`, do not acquire:
   - non-expired => `WAITING_FOR_FORGE`;
   - expired => `FORGE_LEASE_STRANDED / HUMAN_REQUIRED`.
3. If `state=FREE`, build a candidate `HELD` state with:
   - `generation = previous generation + 1`;
   - this Work task id in `holder_task_id`;
   - a fresh non-secret `lease_token`;
   - the exact `target_repository`, `target_pr` and `expected_head` about to be mutated;
   - `acquired_at` and `expires_at` in UTC;
   - `released_at = null`.
4. Replace the lease file with GitHub Contents API using the exact blob SHA observed in step 1 as the update precondition.
5. Conflict, stale SHA, permission failure or ambiguous result means **lease not acquired**. Perform zero product writes and do not retry blindly.
6. Re-fetch the lease. Ownership exists only if state, holder, token, generation, target tuple and expiry all match the candidate. Record the current lease blob SHA as `fencing_sha`.

Two contenders reading the same `FREE` snapshot cannot both acquire because the content SHA is the CAS boundary.

## Final admission and product write

Immediately before the one product mutation protected by the lease, re-fetch both product state and lease.

Require all of:

- lease `state == HELD`;
- holder task id, token and generation equal this invocation;
- target repository and PR equal the product being changed;
- product PR is still open and on the expected base;
- current product HEAD equals lease `expected_head`;
- lease is not expired;
- current lease blob SHA equals this invocation's `fencing_sha`;
- worker identity, scope and human gates are still admissible.

If any condition fails, perform zero product mutation and proceed only to safe lease release when this invocation still owns the same fence.

The protected mutation should be a single bounded commit/update whenever practical. No unrelated product mutation may share the same lease transaction.

## Immediate release

Release is the **immediate next coordination operation after the protected product mutation**. Do not perform another product write, another PR repair, lengthy analysis, reporting or unrelated network work while retaining the lease.

Re-fetch the canonical lease and require the same holder/token/generation/target/fencing SHA. Then conditionally replace it with `FREE` using that exact SHA:

- preserve `generation`;
- clear `holder_task_id`, `lease_token`, `target_repository`, `target_pr`, `expected_head`, `acquired_at`, `expires_at`;
- set `released_at` in UTC.

If the product-write result was ambiguous, first re-read the product PR/HEAD to determine whether the exact intended write landed. Never repeat an ambiguous product write merely to obtain a receipt.

A failed or ambiguous release causes `FORGE_LEASE_STRANDED`; stop the sweep. It never authorizes expiry takeover.

If more PRs require mutation, return to live batch state and acquire a new generation for the next exact product-write transaction.

## Renewal

Renewal is exceptional because leases are intentionally short-lived critical sections. Before expiry only, the holder may CAS-renew against the current `fencing_sha` while preserving holder/token/generation/target and changing only expiry. Re-fetch and adopt the new blob SHA as `fencing_sha`.

Never renew after expiry or after a fence mismatch.

## Crash and stranded recovery

- Crash before acquisition: no lease state exists to recover.
- Crash while `HELD`: fail closed. Even after expiry, no automated takeover is allowed because the previous invocation may have passed its final fence check before pausing.
- Successful release to `FREE`: any later Forge invocation may acquire normally.
- Explicit human/control-plane reconciliation of a stranded `HELD` lease must use the exact current blob SHA and must not be inferred from elapsed time alone.

No runtime `holder_run_id` is required for automated takeover because automated takeover of `HELD` is forbidden. If a future runtime exposes an authoritative immutable invocation identity and terminality primitive, a later contract version may define safe reclaim explicitly.

## Shared writer contract

Both `Roots — PR Forge` and `Roots — PR Forge Reconciliation` use this same resource and transaction protocol. Reconciliation remains recovery/fallback only and creates no second mutation lane.

The lease does not:

- create or replace Jules/ChatGPT worker identity;
- authorize a new branch or PR;
- publish `roots-quality-verdict`;
- assign `factory:risk-low`;
- bypass CI, review, human gates or merge policy;
- authorize secrets, permissions, providers, billing or production changes.

Native Quality/Risk/merge remain independent.

## Event semantics

Wake-up payloads are hints. Each invocation rebuilds the whole admissible Jules PR batch from live GitHub state. A wake-up for one PR never narrows discovery to that PR.

PR opened/ready/commit-update wake-ups and periodic reconciliation share the same writer protocol. The periodic schedule remains best-effort fallback only.

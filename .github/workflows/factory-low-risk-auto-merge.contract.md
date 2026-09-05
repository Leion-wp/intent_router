# factory-low-risk-auto-merge-v1 contract

This workflow is fail-closed. A managed-repository pull request may merge automatically only when all of these remain true on the exact head immediately before merge:

- the PR carries `factory:risk-low`;
- the PR is open, non-draft, targets the profile `default_branch`, and has no requested changes;
- the PR/issue carries none of `factory:human-required`, `factory:blocked`, `factory:escalated`;
- no protected/high-risk path is changed (`.github/workflows/**`, `.factory/**`, CODEOWNERS, migrations/infra/deploy paths, dependency lockfiles);
- every job listed by `.factory/profile.json -> ci.required_jobs` has a successful completed check run on the validated head;
- the exact head SHA, base, open state, draft state and LOW_RISK label are re-read immediately before merge.

Any absent, stale, contradictory or unprovable prerequisite results in no merge. Successful merges use squash and leave issue completion, worker-lock release, telemetry refresh and successor selection to existing reconciliation/scheduler workflows.

## Required denial cases

1. risk unknown/medium/high;
2. pending/red/missing required CI;
3. moved head after CI validation;
4. human-required/blocked/escalated work;
5. protected-path changes;
6. wrong base, draft PR, requested changes or dirty/blocked merge state.

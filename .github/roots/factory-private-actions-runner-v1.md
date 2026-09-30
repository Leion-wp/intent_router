# Private Actions runner contract v1

## Goal

Managed private repositories must not depend on GitHub-hosted Actions minutes for their steady-state CI or control relay.

The migration target is self-hosted execution with two independent runner classes:

- `roots-private-ci`: product CI. It may check out and execute product/PR code. It must not receive Factory/Fleet cross-repository credentials.
- `roots-private-control`: metadata-only control relay. It may receive the narrowly scoped `FACTORY_EVENT_TOKEN`, but it must never check out or execute product/PR code.

Both classes include the default `self-hosted`, OS and architecture labels defined in `factory-private-actions-runner-v1.json`.

## Security boundary

Do not run product CI and privileged control relay on the same persistent runner instance. Product PR code is untrusted. A compromised persistent self-hosted runner can survive into later jobs and observe future credentials.

Prefer an ephemeral runner instance for each job. If a persistent host is used during bring-up, isolate the two classes at least by separate disposable VM/container boundary, runner work directory, operating-system identity and repository registration.

The public `intent_router` control plane must never become a free hosted-runner proxy that checks out or executes private product code. Public Actions can validate control-plane contracts only.

## Migration

1. Provision a self-hosted runner for each required class and repository (or a restricted runner group when the account topology supports it).
2. Apply the exact labels from the JSON contract.
3. Migrate the private repository workflows from `ubuntu-latest` to their class labels.
4. Verify an exact-head private run has a real runner assignment and real steps.
5. Only then treat the previous private pre-runner quota epoch as recovered.

No CI/Risk/Quality/merge gate is weakened by this migration. A queued job with no matching runner is not PASS.

# Factory Release Readiness v1

Production deployment remains a human-owned transition. The factory may nevertheless prove when a product is ready for that decision.

## Required evidence

A managed product becomes `factory:release-ready` only when all of the following are true:

- `.factory/product-state.json` phase is `LAUNCH_READY`;
- no milestone is open;
- no `factory:queued`, `factory:dispatching`, `factory:dispatched` or `factory:blocked` issue remains;
- no pull request is open;
- the credential provisioning gate exists and a human has attested it with `factory:credentials-ready`;
- the repository default-branch HEAD is resolved from GitHub at reconciliation time;
- a push CI run for that exact HEAD completed successfully;
- every job named in `.factory/profile.json -> ci.required_jobs` succeeded in that same exact-head run;
- the default-branch HEAD is re-read immediately before `factory:release-ready` is created or refreshed and still equals the verified CI head.

A successful historical run on the same branch is never sufficient release evidence for a newer HEAD. If the branch advances, including via a push whose CI is skipped, readiness waits for required CI on the new HEAD.

The workflow never reads secret values. Credential readiness is an attestation boundary only.

## Human gate

When the evidence is complete, the workflow creates or refreshes `[FACTORY] Production release approval` with `factory:release-ready` and `factory:human-required`.

A human may add `factory:release-approved` after reviewing the evidence. The label records explicit approval but does not deploy anything by itself. A future production controller must remain separately authorized and must consume that approval without expanding permissions or secret access.

## Fail closed

Missing credentials, missing exact-head CI, active work, failed CI, blocked work, a default-branch HEAD change during reconciliation, or ambiguous state results in `RELEASE_WAITING`; no release-ready claim is created.

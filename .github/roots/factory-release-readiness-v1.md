# Factory Release Readiness v1

Production deployment remains a human-owned transition. The factory may nevertheless prove when a product is ready for that decision.

## Required evidence

A managed product becomes `factory:release-ready` only when all of the following are true:

- `.factory/product-state.json` phase is `LAUNCH_READY`;
- no milestone is open;
- no `factory:queued`, `factory:dispatching`, `factory:dispatched` or `factory:blocked` issue remains;
- no pull request is open;
- the credential provisioning gate exists and a human has attested it with `factory:credentials-ready`;
- the latest push CI on the repository default branch completed successfully;
- every job named in `.factory/profile.json -> ci.required_jobs` succeeded in that run.

The workflow never reads secret values. Credential readiness is an attestation boundary only.

## Human gate

When the evidence is complete, the workflow creates or refreshes `[FACTORY] Production release approval` with `factory:release-ready` and `factory:human-required`.

A human may add `factory:release-approved` after reviewing the evidence. The label records explicit approval but does not deploy anything by itself. A future production controller must remain separately authorized and must consume that approval without expanding permissions or secret access.

## Fail closed

Missing credentials, missing CI, active work, failed CI, blocked work or ambiguous state results in `RELEASE_WAITING`; no release-ready claim is created.

# Factory CI Debugger v1

Deterministic diagnostic layer between a managed product CI failure and the existing worker session.

## Invariants

- GitHub remains source of truth.
- Never creates a replacement issue, PR, branch or worker session for rework.
- Repairs are routed to the existing correlated session/PR.
- Workflow, secret, permission, deployment and branch-protection changes are `HUMAN_REQUIRED`.
- A diagnosis never grants merge authority. Quality verdicts remain head-specific and independent.
- Same `head + class + culprit` is not retried indefinitely.
- Maximum automatic repair attempts: 4.

## Classes

`INSTALL`, `LINT`, `TYPECHECK`, `TEST`, `TEST_HARNESS_INVALID`, `BUILD`, `ENV_VALIDATION`, `RUNTIME_INIT`, `UNKNOWN`.

## Tool pipeline

`failure -> slice evidence -> classify -> diagnose -> same-session rework -> rerun failed job -> quality`

`UNKNOWN`, protected changes, repeated fingerprints or exhausted budget transition to `HUMAN_REQUIRED`.

## Diagnosis contract

```json
{
  "version": 1,
  "head": "FULL_SHA",
  "class": "RUNTIME_INIT",
  "culprit": "src/lib/email/index.ts",
  "evidence": "Missing API key",
  "root_cause": "SDK instantiated during build-time module evaluation",
  "repair_scope": ["src/lib/email/index.ts"],
  "confidence": 0.97,
  "retryable": true,
  "requires_human": false
}
```

## Reference incident

Product PR #14 exposed the sequence:

`ENV_VALIDATION -> TEST_HARNESS_INVALID -> RUNTIME_INIT/Stripe -> RUNTIME_INIT/Resend -> PASS`.

This sequence is the reference fixture for convergence tests. The debugger should reduce evidence and classify each failure; it must not encode product-specific fixes.

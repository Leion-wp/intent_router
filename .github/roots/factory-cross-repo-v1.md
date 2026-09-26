# Roots Factory cross-repo control-plane v1

## Purpose

The control-plane in `Leion-wp/intent_router` is the fleet brain. Managed product repositories are execution surfaces, not copies of the entire control-plane.

`intent_router` itself remains a special product target: branch `Android`, workspace `/acode-plugin`. The cross-repo layer must never weaken that invariant.

The current fleet owner is the personal GitHub account `Leion-wp`, not a GitHub organization. Account-level workflows therefore use authenticated-user repository and Projects v2 APIs, while repository-local operations continue to address targets as `Leion-wp/<repo>`.

## Managed repository identity

A fleet-managed repository contains `.factory/profile.json` conforming to `factory-repository-profile.schema.json`. Discovery is therefore decentralized: the fleet scans repositories owned by the authenticated fleet account and only operates on repositories that explicitly self-identify as managed.

This avoids copying schedulers and worker orchestration into every product repository.

## Fixed micro-SaaS stack

Blueprint `roots-micro-saas-v1` is intentionally opinionated:

- Next.js App Router + TypeScript + pnpm
- Tailwind CSS + shadcn/ui + Zod
- Supabase PostgreSQL + Auth + Storage + RLS
- Stripe Checkout + subscriptions + customer portal + verified webhooks
- Resend + React Email
- Sentry + PostHog
- Vitest + Playwright
- Vercel preview/production deployment boundary

Provider changes are architecture changes and therefore human-approved. Package versions may be upgraded through normal maintenance without replacing the provider architecture.

## Bootstrap

`factory-bootstrap-micro-saas-v1` creates or reconciles a private repository owned by `Leion-wp`, writes the managed profile, installs a minimal CI workflow, pins the stack manifest, creates the `MVP Boilerplate` milestone and seeds a dependency-ordered backlog.

The bootstrap workflow is a human control-plane mutation and requires both `workflow_dispatch`, `apply=true`, and the human-provisioned `FLEET_GITHUB_TOKEN`. It verifies that the token authenticates as the expected fleet owner before mutating account state.

The seeded backlog builds the reusable boilerplate in this order:

1. application foundation;
2. Supabase auth/database/RLS;
3. Stripe billing and Resend/dashboard work after auth;
4. observability after foundation;
5. hardening/tests/docs after all product capabilities.

## Fleet scheduling

`factory-fleet-scheduler-v1` discovers repositories owned by the authenticated fleet account, considers open `factory:queued` issues, honors `Blocked-By: #N`, rejects tasks with an active linked PR, then dispatches the oldest eligible item through the central cross-repo dispatcher.

Only one candidate is dispatched per scheduler run. This intentionally limits blast radius while the fleet is young.

## Cross-repo execution

`factory-cross-repo-dispatch-v1` compiles the target issue into a dynamic FactoryTask using the target repository profile. The first enabled cross-repo worker is Jules.

The dispatcher validates that the repository is already exposed as a Jules GitHub source. If it is not, execution fails `HUMAN_REQUIRED`; the factory never attempts to modify Jules/GitHub installation permissions.

The Jules session mapping is persisted on the target issue. Work identity remains:

`repository + issue -> one active worker session -> one active PR -> CI/rework -> final result`.

## Same-session CI rework

`factory-fleet-jules-rework-v1` scans managed repositories owned by the fleet account for dispatched issues with a persisted Jules session and one linked PR. Failed check-runs on a new PR head SHA are sent to `sessions/{id}:sendMessage` for the same session. A dedupe marker keyed by PR head SHA prevents the same failure from being sent repeatedly.

No fallback may create a replacement session or replacement PR.

## Human boundary

Fleet workers may write product code, tests and ordinary PRs. They may not modify workflows, control-plane policy, secrets, credential material, permissions or production state.

Repository creation, Projects v2 creation, control-plane workflow changes, provider architecture changes, credential provisioning and production deployment remain human-authorized operations.

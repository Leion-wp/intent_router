# Leion Delivery Founding Pilot

## Offer name

Leion Delivery Founding Pilot

## Buyer

- CTO or engineering manager at a small product team with recurring GitHub issue, PR, and release friction
- software agency or software factory repeating delivery motions across client repos
- platform or developer productivity owner who wants governed workflow packaging, explicit approval, and proof capture instead of another standalone AI seat

## Trigger moment

The team has recurring GitHub delivery work and wants AI help, but still needs explicit review, approval, repo targeting, and auditability instead of opaque autonomy or hosted code execution.

## Promise

Turn recurring GitHub delivery steps into governed, reusable workflows that draft changes, improve PRs, and run release gates with explicit human approval, local-first execution, and a packaged control-plane path for run visibility.

## Packaging

- `4-week` pilot
- `1 organization`
- `up to 5 repos`
- `3 delivery workflows`
- one customer workspace or repo group operating surface
- one named owner on the customer side
- one repeatable demo path at the end

## Included workflows

- `Issue -> PR`
- `PR Review -> Fix / Improve`
- `Release / QA / Security Gate`

The V1 product pack also includes one `delivery.orchestrator` entry point that routes to these three workflows. It supports the pilot demo and operating surface, but it should not be sold as a fourth paid workflow.

## Boundaries

- Human approval stays on sensitive steps.
- Merge automation is optional and lives in the release gate, not the issue-to-PR flow.
- Execution stays local-first through VS Code or a lightweight runner, not remote code execution.
- The paid control plane story is governance, metadata, run visibility, and webhook routing, not full hosted autonomy.
- Early pilots still require manual issue or PR summaries where runtime context propagation is not yet automatic.
- `BYO AI keys` or explicit usage pass-through remains the default in V1.
- The operator still needs a prepared local repo, authenticated `gh`, configured `git`, and a working validation command.
- Public-plan items such as hosted webhook relay, centralized run history, audit export, SSO, private runners, and SLAs remain post-pilot pricing hypotheses unless explicitly scoped.

## Pilot scope

- install and configure Leion Roots for one team or one repo group
- connect the first `Leion Delivery Control Plane` workspace shape and repo metadata path
- adapt the three delivery workflows and the orchestrator routing surface
- define approval points and basic operating rules
- run initial tests with real issues or PRs
- hand over a repeatable demo path, onboarding checklist, and proof capture checklist

## Success metrics

- one issue goes from brief to branch, patch, and PR with review
- one PR review/fix flow completes on a real PR
- one release or gate workflow runs end to end on a real repo
- the orchestrator can route cleanly to the chosen workflow without direct writes of its own
- the team can explain where approval is required, what remains manual, what repo context is explicit, and what the control plane adds versus local runtime alone

## Pricing hypothesis

- `Founding Pilot`: `4 500 EUR` fixed setup and adaptation
- `Post-pilot subscription`: `1 000 EUR / month`
- `LLM usage`: `BYO AI keys` or explicit pass-through, not bundled unlimited usage

Treat these numbers as the working commercial default until real pilot evidence pushes them up or down.

## Why this is credible

- the product already has a narrow three-workflow delivery pack, one orchestrator entry point, and supporting offer assets
- the execution model is governed, not magical
- the two code-changing flows put human diff review before stage, commit, push, or PR creation
- the release flow puts QA, security, and PR checks before a human pause for optional merge or publication
- contract tests validate catalog pricing rules, existing pipeline/doc references, approval-before-write ordering, explicit repo targeting, and orchestrator routing
- the runtime stays local-first while the control plane story stays operational and specific
- the buyer can start with one repo group and one pilot instead of a platform rewrite

## Main objections

- `We do not want autonomous code changes`
  - Answer: keep review and approval gates in the flow; merge stays optional.
- `We already have Copilot or Codex`
  - Answer: Leion packages repeatable governed workflows, proof capture, and operating rules, not just isolated prompts.
- `We need auditability`
  - Answer: Leion focuses on explicit steps, review checkpoints, guarded write ordering, and run visibility as the control plane matures. Do not claim enterprise audit maturity until live exports exist.
- `This sounds custom`
  - Answer: start from a fixed delivery pack, then adapt only the minimum needed.
- `We do not want cloud-hosted code execution`
  - Answer: execution stays local-first; the control plane handles governance, metadata, and routing.
- `We already have scripts for this`
  - Answer: the value is reusable governed workflows with approval policy and proof assets, not just automation scripts.
- `What proof exists today?`
  - Answer: the strongest proof is structural: parseable pipeline artifacts, catalog packaging, mocked contract coverage, and approval-before-write ordering. Live screenshots, run exports, and ROI evidence are still missing.

## Next proof needed

- a clean end-to-end run narrative on a safe real repo with screenshots of graph, approval, validation, and output
- one run export that shows approvals, artifacts, logs, repo targeting, and audit trail
- one case-study style before/after workflow summary with explicit pilot success criteria
- one evidence-backed timing or effort claim from a real run
- one buyer discovery note proving that the agency, CTO, or platform-owner wedge maps to an urgent paid pilot trigger

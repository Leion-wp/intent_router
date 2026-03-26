# Leion Delivery Proof Loop

## Buyer Problem

Engineering teams repeat the same delivery motions around issues, pull requests, and release checks, but they do not want a black-box agent making write or merge decisions without an explicit human checkpoint.

## Proof Thesis

The strongest credible proof in this repo is not "fully autonomous shipping."
It is that Leion Delivery already packages common GitHub delivery work into reusable pipeline artifacts with visible human approval steps before guarded write actions.

## Real Artifact Inventory

| Artifact | What it credibly proves now | What it does not prove yet |
| --- | --- | --- |
| `pipeline/product-1/delivery.issue-to-pr.intent.json` | A defined `Issue -> reviewed patch -> validation -> commit -> push -> PR` flow exists with `vscode.reviewDiff` before `git add`, `git commit`, `git push`, and `github.openPr`. | That the flow has completed successfully on a live customer repo. |
| `pipeline/product-1/delivery.pr-review-fix.intent.json` | A defined `PR -> corrective patch -> review -> validation -> push -> rerun checks` flow exists with human review before code writeback. | That it reduced review time or fixed a real PR in production. |
| `pipeline/product-1/delivery.release-gate.intent.json` | A defined release gate exists with QA, security, PR checks, then `system.pause` before optional merge or release publication. | That a release was approved and published through this gate end-to-end. |
| `pipeline/product-1/delivery.orchestrator.intent.json` | The three delivery workflows are packaged behind a single entry point via `system.subPipeline`. | That operators prefer the orchestrator UI in practice. |
| `docs/product-1/leion-delivery-v1.md` | Product scope, prerequisites, node-by-node design, and manual test protocol are documented. | That the manual protocol has been executed and captured. |
| `src/controlPlane/leionDeliveryCatalog.ts` | The product is packaged as `Leion Delivery Control Plane` with exactly three templates and explicit proof goals per template. | That buyers have adopted the packaged offer. |
| `src/test/controlPlane_contracts_mocked.test.ts` | The repo enforces that each delivery template points to existing assets and keeps guarded write steps after the human approval step. | Real runtime audit logs or customer outcomes. |
| `docs/proof/leion-delivery-demo-script.md` | A demo script already exists and can be aligned to the repo artifacts. | That demo screenshots, run exports, or objections have been captured. |

## Strongest Credible Narrative

Before Leion Delivery, issue-to-PR, PR repair, and release gating usually live in tribal knowledge, ad hoc prompts, or brittle scripts.

In this repo, those motions are already turned into named pipeline assets:

- `Issue to PR`
- `PR Review Fix`
- `Release Gate`

The proof is strongest when framed this way:

1. The workflows are explicit artifacts, not a one-off prompt.
2. Human approval is modeled as a first-class step, not a promise in slideware.
3. Destructive or external actions happen only after the approval checkpoint and remain optional where risk is highest.
4. The same product also packages these workflows into a control-plane catalog, so the story is about repeatable delivery operations, not just raw pipeline syntax.

## Demo Narrative To Use

### Opening

Start with the claim that matters: Leion Delivery is a governed AI delivery workflow pack for GitHub work, not an autonomous merge bot.

### Walkthrough

1. Open `delivery.orchestrator` and show that one entry point routes into three concrete delivery workflows.
2. Open `delivery.issue-to-pr` and show the sequence from input capture to patch generation.
3. Pause on `review_patch` and say clearly that no stage, commit, push, or PR creation happens before this approval.
4. Point to the later steps: `git add -A`, `git commit`, `git push`, then `github.openPr`.
5. Open `delivery.pr-review-fix` and show the same pattern applied to existing PR remediation.
6. Open `delivery.release-gate` and show that QA, security, and PR checks feed into `system.pause` before optional merge or publish.
7. Close on the control-plane catalog and pricing artifact to show this is being packaged as an offer, not left as internal tooling.

### Talk Track

- "The automation is reusable because it lives as pipeline JSON, not as a one-off operator session."
- "Approval is explicit in the graph and enforced again in tests."
- "Merge and publish remain opt-in, which keeps risky actions governed."
- "What the repo proves today is workflow design and guardrails. Live run throughput still needs to be captured."

## Evidence-Backed Proof Points

- Leion Delivery currently ships three named delivery templates plus one orchestrator entry point.
- Both code-changing delivery flows place `vscode.reviewDiff` before stage, commit, push, or PR creation.
- The release flow places `system.pause` before optional merge and optional release publication.
- The control-plane catalog defines proof goals, trigger modes, and commercial packaging for the same three workflows.
- Contract tests verify that approval steps exist and that guarded write steps stay after those approval steps.

## Measurable Claim Candidates

These are candidate claims, not shipped proof. Each one needs a fresh run capture before it should appear on a landing page or in outbound sales copy.

| Claim candidate | Credible basis in repo | Missing evidence to convert into a proof claim |
| --- | --- | --- |
| `3 delivery workflows packaged behind 1 orchestrator` | Present in `delivery.orchestrator.intent.json`, the three `delivery.*` pipeline files, and the catalog schema. | Demo screenshot or run export showing an operator selecting and launching one flow from the orchestrator. |
| `100% of guarded write actions in V1 flows occur after a human checkpoint` | Enforced by `src/test/controlPlane_contracts_mocked.test.ts` against the current template set. | CI result or test artifact captured in a proof appendix. |
| `2 delivery flows require diff review before code writeback` | Present in `delivery.issue-to-pr` and `delivery.pr-review-fix` via `vscode.reviewDiff`. | One screenshot per flow showing the approval UI before continuation. |
| `1 release workflow requires explicit approval before merge or publish` | Present in `delivery.release-gate` via `system.pause`, `mergeAfterGate`, and `publishRelease`. | Live run export showing the pause event and operator decision. |
| `Teams can standardize issue, PR, and release motions without adding seat-based pricing` | Present in the catalog pricing model and template packaging. | Buyer interview notes or pilot usage showing that this packaging actually matched team needs. |

## What Is Missing

No credible evidence of these items was found in the repo during this refresh:

- live end-to-end run export for any Leion Delivery workflow
- screenshot of `vscode.reviewDiff` in the delivery flows
- screenshot of the release `system.pause` gate
- CI or local test artifact proving the guarded-write contract test passed on the current branch
- timing, effort, or defect comparison against a manual baseline
- buyer quote, pilot summary, or testimonial

## Next Evidence To Capture

1. Run `delivery.issue-to-pr` on a safe demo repo and save:
   - graph screenshot
   - approval screenshot at `review_patch`
   - final PR URL or run export
2. Run `delivery.release-gate` on a safe PR and save:
   - screenshot of QA/security steps completed
   - screenshot of the `system.pause` approval moment
   - final PR comment or release decision artifact
3. Capture one proof appendix from the test suite:
   - successful run of the control-plane contract test that verifies approval-before-write ordering
4. Record one manual baseline:
   - operator-estimated steps or minutes for the same issue-to-PR motion without the pipeline
5. After one real pilot, add:
   - repo count in scope
   - workflow frequency
   - one direct quote about governance or repeatability

## Recommended Short Proof Snippet

Leion Delivery already proves a narrower but credible story: issue-to-PR, PR repair, and release gating are packaged as reusable delivery workflows with explicit human approval before guarded write actions. The repo does not yet prove speed or ROI, but it does prove workflow structure, governance intent, and offer packaging well enough to support a live pilot demo.

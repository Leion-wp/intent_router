# Leion Delivery Proof Loop

Last refreshed: `2026-05-05`

## Buyer Problem

Engineering teams repeat the same GitHub delivery motions around issues, pull requests, and release gates, but they do not want a black-box agent committing, pushing, merging, or publishing without an explicit human checkpoint.

## Proof Thesis

The strongest credible proof in this repo is not autonomous shipping, production ROI, or customer adoption.

It is narrower and more defensible: Leion Delivery packages recurring GitHub delivery work into reusable pipeline artifacts where approval is visible in the graph, repo targeting is explicit, and guarded write actions sit behind explicit human checkpoints before both local branch mutation and downstream writeback.

## Real Artifact Inventory

| Artifact | What it credibly proves now | What it does not prove yet |
| --- | --- | --- |
| `pipeline/product-1/delivery.issue-to-pr.intent.json` | A defined `Issue -> branch gate -> branch prep -> patch proposal -> human diff review -> validation -> commit -> push -> PR` flow exists. `branch_gate` uses `system.pause` before `git checkout -B`, and `review_patch` uses `vscode.reviewDiff` before `git add -A`, `git commit`, `git push`, and `github.openPr`. `github.openPr` targets `${var:repoSlug}` explicitly. | That the flow has completed successfully against a live repo with saved screenshots, run export, and final PR URL. |
| `pipeline/product-1/delivery.pr-review-fix.intent.json` | A defined `PR -> branch gate -> checkout -> analysis -> patch proposal -> human diff review -> validation -> commit -> push -> optional comment -> rerun checks` flow exists. `branch_gate` uses `system.pause` before local branch checkout, and the PR comment and check rerun explicitly target `${var:repoSlug}` and `${var:prNumber}`. | That it reduced review time, fixed a real production PR, or improved reviewer throughput. |
| `pipeline/product-1/delivery.release-gate.intent.json` | A defined release gate runs QA, security, and PR checks before `human_gate` uses `system.pause`. Merge and release publication are optional switches after the gate and default to disabled in the form. | That a release was approved, merged, or published through this gate end to end. |
| `pipeline/product-1/delivery.orchestrator.intent.json` | One entry point routes to the three delivery workflows through `system.subPipeline`; the orchestrator itself does not directly write code, push, merge, or publish. | That operators prefer the orchestrator in practice or that a live launch from it has been captured. |
| `src/controlPlane/leionDeliveryCatalog.ts` | The product is packaged as `Leion Delivery Control Plane` with exactly three paid delivery templates, approval step ids, trigger modes, proof goals, repo/workflow-based pricing, `bySeat: false`, and a current sales playbook doc reference. | That buyers have accepted the packaging or pricing. |
| `src/test/controlPlane_contracts_mocked.test.ts` | Mocked contract coverage checks catalog shape, asset references, approval-before-guarded-write ordering, branch-gate-before-local-mutation ordering, guarded write sandboxes, explicit GitHub repo/PR targeting, orchestrator routes, sync envelopes, and runner status updates. | A live runtime audit trail or customer outcome. |
| `src/test/history_audit_mocked.test.ts` | History/audit logic can capture review signatures, HITL decisions, and build an audit export in a mocked run. | A real Leion Delivery run export with approvals, logs, artifacts, and repo context. |
| `docs/product-1/leion-delivery-v1.md` | The product doc maps the four V1 pipeline artifacts, prerequisites, node behavior, manual test protocol, and current runtime gaps. It records a `2026-04-21` targeted mocked contract validation while noting the broader mocked run is not fully green because of an unrelated `Pipeline Output Capture (Mocked)` failure. | A fresh proof appendix with command output, screenshots, or run history generated during this proof refresh. |
| `docs/offers/*` and `docs/sales/*` | The founding pilot, landing copy, pricing, security FAQ, and founder sales playbook consistently position the offer as governed, local-first, approval-based, and not an autonomous merge bot. | Buyer discovery notes, paid pilot evidence, or testimonials. |
| `docs/proof/leion-delivery-demo-script.md` | A repeatable `10 to 15 minute` demo shape already exists: show the graph, show approvals, run one workflow, then capture proof. | Actual demo screenshots, objections, run exports, or outcome notes. |

## Strongest Credible Narrative

Before Leion Delivery, issue implementation, PR repair, and release gates often live as a mix of ad hoc prompts, local scripts, review habits, and checklist memory.

In this repo, those motions are represented as named workflow assets:

- `Issue to PR`
- `PR Review Fix`
- `Release Gate`

The credible demo story is:

1. The workflows are explicit `.intent.json` artifacts, not a one-off operator prompt.
2. AI proposes changes, but approval is modeled as workflow steps rather than implied reviewer trust.
3. The two code-changing flows require `system.pause` before local branch mutation and `vscode.reviewDiff` before stage, commit, push, PR creation, PR comment, or check rerun.
4. The release flow requires `system.pause` before optional merge or release publication.
5. GitHub steps target `repoSlug` and `prNumber` explicitly instead of relying only on ambient checkout state.
6. The control-plane catalog packages the same three workflows into a sellable pilot with proof goals and non-seat pricing.
7. A fresh `2026-05-05` mocked test run still validates the delivery contracts after current-doc cleanup; the remaining mocked failure in this area is outside Leion Delivery (`Pipeline Output Capture (Mocked)`).

## Demo Narrative To Use

### Opening

Start with the design constraint: Leion Delivery is a governed AI workflow pack for GitHub delivery work, not an autonomous merge bot.

### Walkthrough

1. Open `delivery.orchestrator` and show the operator choosing one of three workflows.
2. Point out that the orchestrator routes through `system.subPipeline` and performs no direct write, push, merge, or publish action.
3. Open `delivery.issue-to-pr` and show the input form: `repoPath`, `repoSlug`, issue fields, branch fields, and validation command.
4. In `delivery.issue-to-pr`, stop first at `branch_gate` and say local branch mutation is blocked until a human continues.
5. Follow the graph to `team_generate_patch`, then stop again at `review_patch`.
6. Say: "No stage, commit, push, or PR creation happens before this review step, and no branch reset happens before the earlier gate."
7. Continue through validation, `git add -A`, commit, push, and `github.openPr`.
8. Open `delivery.pr-review-fix` and show the same two-checkpoint pattern for an existing PR, including optional PR comment and failed-check rerun.
9. Open `delivery.release-gate` and show QA, security, and PR checks feeding into `human_gate`.
10. Show that `mergeAfterGate` and `publishRelease` are explicit options after the gate, not defaults hidden before approval.
11. Close on the catalog and founding pilot docs: three workflows, local-first execution, BYO AI keys, proof capture, and no seat-based pricing.

### Talk Track

- "The current proof is structural: these are reusable workflow artifacts with approval modeled in the graph."
- "The two code-changing flows put one human checkpoint before local branch mutation and another before code writeback."
- "Merge and publish are limited to the release gate and remain opt-in."
- "The next proof step is not a stronger claim; it is a captured live run with screenshots, a PR URL, and an export."

## Evidence-Backed Proof Points

- Leion Delivery currently has `3` named delivery templates plus `1` orchestrator entry point.
- The two code-changing delivery flows use `system.pause` before local branch mutation.
- The two code-changing delivery flows use `vscode.reviewDiff` before stage, commit, push, PR creation, PR comment, or check rerun.
- The release flow uses `system.pause` before optional merge or release publication.
- The issue-to-PR flow opens a PR but does not merge it.
- The orchestrator routes to child pipelines and does not directly perform guarded write actions.
- The catalog records approval step ids, proof goals, trigger modes, founding pilot packaging, public plan hypotheses, `BYO AI keys`, and non-seat pricing.
- A `2026-05-05` local run of `npm run test:mocked -- --grep "Control Plane Contracts"` passed the delivery-specific contract assertions after the current-doc sales-playbook reference was corrected.
- Mocked contract tests cover approval-before-guarded-write ordering, branch-gate-before-local-mutation ordering, explicit GitHub repo/PR targeting, existing asset references, orchestrator routing, sync envelopes, and runner status updates.
- Mocked history/audit coverage shows review signatures and HITL decisions can be represented in an audit export shape.

## Measurable Claim Candidates

These are candidate claims, not public proof claims. Each one needs a captured artifact before it should move into landing-page copy, outbound sales copy, or a case study.

| Claim candidate | Credible basis in repo | Missing evidence to convert into a proof claim |
| --- | --- | --- |
| `3 delivery workflows packaged behind 1 orchestrator` | Present in `delivery.orchestrator.intent.json`, the three child pipeline files, and `LEION_DELIVERY_CATALOG.templates`. | Screenshot or run export showing an operator launching one child workflow from the orchestrator. |
| `2 code-changing flows require approval before local branch mutation` | `delivery.issue-to-pr` and `delivery.pr-review-fix` both use `branch_gate` with `system.pause` before `prepare_branch`. The mocked contract suite asserts this ordering directly. | One screenshot per flow showing the branch gate before continuation. |
| `2 code-changing flows require diff review before code writeback` | `delivery.issue-to-pr` and `delivery.pr-review-fix` both use `review_patch` with `vscode.reviewDiff` before guarded writes. | One screenshot per flow showing the diff review UI before continuation. |
| `1 release workflow gates optional merge and publish behind explicit approval` | `delivery.release-gate` runs QA/security/checks before `human_gate`; merge and publish switches happen after the gate. | Live run export showing the pause event, operator decision, and final branch/release outcome. |
| `Guarded write actions in the current catalog are tested to occur after approval steps` | `src/test/controlPlane_contracts_mocked.test.ts` validates current catalog templates, branch gates, and guarded write ordering. A fresh `2026-05-05` local run confirmed the delivery contract assertions still pass after doc-reference cleanup. | Saved proof appendix with exact command, timestamp, and full output excerpt. |
| `The product uses repo/workflow packaging rather than seat pricing` | `leionDeliveryCatalog.ts`, pricing docs, and founding pilot docs set `bySeat: false`, repo limits, workflow limits, and BYO AI key posture. | Buyer interview or pilot note confirming this pricing model matched the buyer's decision criteria. |
| `The control plane can represent approvals, artifacts, and logs in run sync payloads` | `PipelineSyncEnvelopeSchema` is exercised in mocked contract tests with approvals, artifacts, and logs. | A real run sync/export from the delivery pack, not a mocked schema fixture. |
| `The runtime can preserve review and HITL audit data` | `history_audit_mocked.test.ts` covers review signatures, HITL decisions, and audit export construction. | Export from a real `delivery.issue-to-pr` or `delivery.release-gate` run. |

## What Is Still Missing

No credible evidence of these items was found in the repo during this refresh:

- live end-to-end run export for `delivery.issue-to-pr`, `delivery.pr-review-fix`, or `delivery.release-gate`
- screenshot of `vscode.reviewDiff` in either code-changing delivery flow
- screenshot of `branch_gate` in either code-changing delivery flow
- screenshot of the release `system.pause` / `human_gate` moment
- final PR URL created by a Leion Delivery demo run
- release gate output showing approval, optional merge decision, optional publish decision, and final status comment
- saved CI/local test artifact from this proof refresh
- timing, effort, defect, review-cycle, or throughput comparison against a manual baseline
- account tracker, discovery note, buyer quote, pilot summary, or testimonial
- evidence that the orchestrator is preferred over launching child workflows directly

## Next Evidence To Capture

1. Run `delivery.issue-to-pr` on a safe demo repo and save:
   - graph screenshot from the orchestrator or child workflow
   - filled input form screenshot with non-sensitive values
   - `branch_gate` approval screenshot
   - `review_patch` approval screenshot
   - validation output
   - final PR URL
   - run export or history audit export
2. Run `delivery.release-gate` on a safe PR and save:
   - QA command output
   - security command output
   - PR checks output
   - `human_gate` approval screenshot
   - merge/publish choices and final PR comment or release decision artifact
3. Save one proof appendix from the test suite:
   - exact command
   - timestamp
   - targeted `Control Plane Contracts (Mocked)` result
   - note that a stale sales-playbook doc reference was corrected during this refresh
   - note whether the broader mocked suite is still blocked by the unrelated output-capture failure
4. Capture one manual baseline:
   - number of manual steps or minutes for issue-to-PR without the pipeline
   - number of handoffs or review loops
   - where approval currently happens
5. After one real discovery call or pilot, add:
   - buyer segment
   - repo group shape
   - repeated workflow pain in the buyer's words
   - one explicit governance requirement
   - one reason to proceed or disqualify

## Recommended Short Proof Snippet

Leion Delivery already proves a narrow, credible story: issue-to-PR, PR repair, and release gating are packaged as reusable GitHub delivery workflows with explicit human approval before local branch mutation and before guarded write actions. The repo does not yet prove speed, ROI, production adoption, or enterprise audit maturity. It does prove workflow structure, governance intent, explicit repo targeting, control-plane packaging, and mocked contract coverage well enough to support a live pilot demo.

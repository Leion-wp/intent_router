import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const { PipelineSyncEnvelopeSchema, RunnerStatusUpdateSchema } = require('../../out/controlPlane/contracts');
const { LEION_DELIVERY_CATALOG, LeionDeliveryCatalogSchema } = require('../../out/controlPlane/leionDeliveryCatalog');

suite('Control Plane Contracts (Mocked)', () => {
  function readPipeline(ref: string): any {
    const root = path.resolve(__dirname, '..', '..');
    const absolute = path.resolve(root, ref);
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  }

  test('validates the Leion Delivery catalog and pricing rules', () => {
    const parsed = LeionDeliveryCatalogSchema.parse(LEION_DELIVERY_CATALOG);

    assert.strictEqual(parsed.controlPlaneName, 'Leion Delivery Control Plane');
    assert.strictEqual(parsed.commercialModel.openCore, true);
    assert.strictEqual(parsed.commercialModel.seatBasedPricing, false);
    assert.strictEqual(parsed.commercialModel.absorbLlmCost, false);
    assert.strictEqual(parsed.commercialModel.foundingPilot.setupFeeEur, 4500);
    assert.strictEqual(parsed.commercialModel.foundingPilot.priceEur, 1000);
    assert.ok(parsed.templates.every((template: any) => template.defaultTriggerModes.includes('manual')));
  });

  test('references existing pipeline and documentation assets', () => {
    const root = path.resolve(__dirname, '..', '..');
    const docRefs = Object.values(LEION_DELIVERY_CATALOG.docs);
    const pipelineRefs = LEION_DELIVERY_CATALOG.templates.map((template: any) => template.pipelinePath);

    for (const ref of [...docRefs, ...pipelineRefs]) {
      const absolute = path.resolve(root, String(ref));
      assert.ok(fs.existsSync(absolute), `Expected asset to exist: ${ref}`);
    }
  });

  test('delivery templates keep approval ids and guarded writes aligned', () => {
    for (const template of LEION_DELIVERY_CATALOG.templates) {
      const pipeline = readPipeline(String(template.pipelinePath));
      assert.ok(Array.isArray(pipeline.steps), `Expected steps array in ${template.pipelinePath}`);

      const byId = new Map<string, any>((pipeline.steps || []).map((step: any) => [String(step.id || ''), step]));
      const approvalStep: any = byId.get(String(template.humanApprovalStepId));
      assert.ok(approvalStep, `Missing approval step ${template.humanApprovalStepId} in ${template.pipelinePath}`);
      assert.ok(
        approvalStep.intent === 'vscode.reviewDiff' || approvalStep.intent === 'system.pause',
        `Approval step ${template.humanApprovalStepId} in ${template.pipelinePath} must be interactive.`
      );

      const approvalIndex = pipeline.steps.findIndex((step: any) => String(step.id || '') === String(template.humanApprovalStepId));
      const guardedWrites = pipeline.steps.filter((step: any) => {
        const intent = String(step.intent || '');
        const command = String(step?.payload?.command || '');
        if (intent === 'github.openPr' || intent === 'github.prComment' || intent === 'github.prRerunFailedChecks') return true;
        if (intent !== 'terminal.run') return false;
        return /git add -A|git commit|git push|gh pr merge|gh release create/i.test(command);
      });

      for (const step of guardedWrites) {
        const stepIndex = pipeline.steps.findIndex((candidate: any) => candidate === step);
        assert.ok(
          stepIndex > approvalIndex,
          `Guarded write step ${step.id} in ${template.pipelinePath} must come after ${template.humanApprovalStepId}.`
        );
        assert.ok(step?.payload?.__sandbox, `Guarded write step ${step.id} in ${template.pipelinePath} must declare __sandbox.`);
      }
    }
  });

  test('delivery github steps avoid implicit repo assumptions', () => {
    const issueToPr = readPipeline('pipeline/product-1/delivery.issue-to-pr.intent.json');
    const prReviewFix = readPipeline('pipeline/product-1/delivery.pr-review-fix.intent.json');
    const releaseGate = readPipeline('pipeline/product-1/delivery.release-gate.intent.json');

    const openPr = issueToPr.steps.find((step: any) => String(step.id || '') === 'open_pr');
    assert.ok(openPr, 'Missing open_pr step in delivery.issue-to-pr.');
    assert.strictEqual(openPr.intent, 'github.openPr');
    assert.strictEqual(openPr.payload?.repo, '${var:repoSlug}', 'delivery.issue-to-pr open_pr must target repoSlug explicitly.');

    for (const [pipelinePath, stepIds] of [
      ['pipeline/product-1/delivery.pr-review-fix.intent.json', ['comment_pr', 'rerun_checks']],
      ['pipeline/product-1/delivery.release-gate.intent.json', ['check_pr', 'comment_gate']]
    ] as Array<[string, string[]]>) {
      const pipeline = pipelinePath.includes('pr-review-fix') ? prReviewFix : releaseGate;
      for (const stepId of stepIds) {
        const step = pipeline.steps.find((candidate: any) => String(candidate.id || '') === stepId);
        assert.ok(step, `Missing ${stepId} in ${pipelinePath}.`);
        assert.strictEqual(step.payload?.repo, '${var:repoSlug}', `${stepId} in ${pipelinePath} must target repoSlug explicitly.`);
        assert.strictEqual(step.payload?.number, '${var:prNumber}', `${stepId} in ${pipelinePath} must target prNumber explicitly.`);
      }
    }
  });

  test('delivery orchestrator switch routes and sub-pipeline sandboxes stay runtime-compatible', () => {
    const orchestrator = readPipeline('pipeline/product-1/delivery.orchestrator.intent.json');
    const byId = new Map<string, any>((orchestrator.steps || []).map((step: any) => [String(step.id || ''), step]));
    const routeStep = byId.get('route_workflow');
    assert.ok(routeStep, 'Missing route_workflow step in delivery orchestrator.');

    const routes = Array.isArray(routeStep.payload?.routes) ? routeStep.payload.routes : [];
    assert.deepStrictEqual(
      routes.map((route: any) => String(route?.value || '')),
      ['issue_to_pr', 'pr_review_fix', 'release_gate'],
      'delivery.orchestrator switch routes must match workflow values directly.'
    );

    const supportedSandboxKeys = ['allowNetwork', 'allowFileWrite', 'timeoutMs'];
    for (const stepId of ['run_issue_to_pr', 'run_pr_review_fix', 'run_release_gate']) {
      const step = byId.get(stepId);
      assert.ok(step, `Missing sub-pipeline step ${stepId} in delivery orchestrator.`);
      const sandbox = step?.payload?.__sandbox;
      assert.ok(sandbox && typeof sandbox === 'object', `Expected __sandbox on ${stepId}.`);
      const sandboxKeys = Object.keys(sandbox).sort();
      assert.deepStrictEqual(
        sandboxKeys,
        [...supportedSandboxKeys].sort(),
        `${stepId} must only use runtime-supported sandbox keys.`
      );
    }
  });

  test('accepts a sync envelope with approvals, artifacts, and logs', () => {
    const parsed = PipelineSyncEnvelopeSchema.parse({
      organizationId: 'org_agency',
      workspaceId: 'ws_core_delivery',
      repoConnectionId: 'repo_intent_router',
      authMode: 'api_key',
      runnerType: 'vscode_extension',
      extensionVersion: '0.1.0',
      templates: [
        {
          id: 'tpl_issue_to_pr',
          key: 'issue_to_pr',
          name: 'Issue to PR',
          pipelinePath: 'pipeline/product-1/delivery.issue-to-pr.intent.json',
          description: 'Governed issue to PR flow.',
          category: 'delivery',
          requiresHumanApproval: true,
          defaultTriggerModes: ['manual', 'webhook']
        }
      ],
      runs: [
        {
          id: 'run_001',
          organizationId: 'org_agency',
          workspaceId: 'ws_core_delivery',
          repoConnectionId: 'repo_intent_router',
          templateId: 'tpl_issue_to_pr',
          status: 'awaiting_approval',
          source: 'webhook',
          startedAt: '2026-03-22T10:00:00Z',
          approvals: [
            {
              stepId: 'review_patch',
              decision: 'approved',
              reviewer: 'cto@example.com',
              decidedAt: '2026-03-22T10:05:00Z'
            }
          ],
          artifacts: [
            {
              kind: 'diff',
              label: 'Reviewed patch',
              uri: 'runs/run_001/patch.diff'
            }
          ],
          logs: [
            {
              timestamp: '2026-03-22T10:01:00Z',
              level: 'info',
              message: 'Webhook received and run started.'
            }
          ]
        }
      ],
      policyPacks: [
        {
          id: 'policy_default',
          workspaceId: 'ws_core_delivery',
          name: 'Default Delivery Policy',
          version: '1.0.0',
          reviewMode: 'warn',
          blockedPaths: ['**/secrets/**'],
          blockedExtensions: ['.pem'],
          maxChangedLines: 500,
          allowNetwork: true,
          allowFileWrite: true
        }
      ]
    });

    assert.strictEqual(parsed.runs[0].status, 'awaiting_approval');
    assert.strictEqual(parsed.runs[0].approvals[0].decision, 'approved');
    assert.strictEqual(parsed.runs[0].artifacts[0].kind, 'diff');
  });

  test('validates runner status updates with streaming logs', () => {
    const parsed = RunnerStatusUpdateSchema.parse({
      jobId: 'job_001',
      runId: 'run_001',
      status: 'running',
      currentStepId: 'team_generate_patch',
      logLines: [
        {
          timestamp: '2026-03-22T10:02:00Z',
          level: 'info',
          message: 'Team patch generation in progress.'
        }
      ],
      approvals: [],
      artifacts: []
    });

    assert.strictEqual(parsed.status, 'running');
    assert.strictEqual(parsed.logLines[0].level, 'info');
    assert.strictEqual(parsed.currentStepId, 'team_generate_patch');
  });
});

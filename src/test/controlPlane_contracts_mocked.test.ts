import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const { PipelineSyncEnvelopeSchema, RunnerStatusUpdateSchema } = require('../../out/controlPlane/contracts');
const { LEION_DELIVERY_CATALOG, LeionDeliveryCatalogSchema } = require('../../out/controlPlane/leionDeliveryCatalog');

suite('Control Plane Contracts (Mocked)', () => {
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

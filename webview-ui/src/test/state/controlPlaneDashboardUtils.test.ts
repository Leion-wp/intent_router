import * as assert from 'assert';
import { buildControlPlaneDashboardModel, DeliveryCatalogRecord } from '../../utils/controlPlaneDashboardUtils';

export function run() {
  const catalog: DeliveryCatalogRecord = {
    productKey: 'leion-delivery',
    controlPlaneName: 'Leion Delivery Control Plane',
    positioning: 'Governed AI delivery workflows.',
    targetCustomers: ['agencies'],
    freeOffer: {
      key: 'free',
      displayName: 'Open Core',
      salesMotion: 'self_serve',
      billingInterval: 'monthly',
      repoLimit: null,
      workflowLimit: null,
      bySeat: false,
      byoAiKeysRequired: true,
      features: ['builder']
    },
    commercialModel: {
      openCore: true,
      seatBasedPricing: false,
      absorbLlmCost: false,
      foundingPilot: {
        key: 'founding_pilot',
        displayName: 'Founding Pilot',
        salesMotion: 'sales_led',
        priceEur: 1000,
        setupFeeEur: 4500,
        billingInterval: 'monthly',
        repoLimit: 5,
        workflowLimit: 3,
        bySeat: false,
        byoAiKeysRequired: true,
        features: ['pilot']
      },
      publicPlans: [
        {
          key: 'starter',
          displayName: 'Starter',
          salesMotion: 'assisted',
          priceEur: 699,
          billingInterval: 'monthly',
          repoLimit: 5,
          workflowLimit: 3,
          bySeat: false,
          byoAiKeysRequired: true,
          features: ['relay']
        },
        {
          key: 'growth',
          displayName: 'Growth',
          salesMotion: 'assisted',
          priceEur: 1499,
          billingInterval: 'monthly',
          repoLimit: 20,
          workflowLimit: 3,
          bySeat: false,
          byoAiKeysRequired: true,
          features: ['analytics']
        },
        {
          key: 'enterprise',
          displayName: 'Enterprise',
          salesMotion: 'sales_led',
          priceEur: 5000,
          billingInterval: 'monthly',
          repoLimit: 50,
          workflowLimit: 3,
          bySeat: false,
          byoAiKeysRequired: true,
          features: ['private runner']
        }
      ]
    },
    templates: [
      {
        key: 'issue_to_pr',
        name: 'Issue to PR',
        pipelinePath: 'pipeline/product-1/delivery.issue-to-pr.intent.json',
        humanApprovalStepId: 'review_patch',
        defaultTriggerModes: ['manual', 'webhook'],
        proofGoal: 'Show issue to PR.'
      },
      {
        key: 'pr_review_fix',
        name: 'PR Review Fix',
        pipelinePath: 'pipeline/product-1/delivery.pr-review-fix.intent.json',
        humanApprovalStepId: 'review_patch',
        defaultTriggerModes: ['manual'],
        proofGoal: 'Show PR review fix.'
      },
      {
        key: 'release_gate',
        name: 'Release Gate',
        pipelinePath: 'pipeline/product-1/delivery.release-gate.intent.json',
        humanApprovalStepId: 'human_gate',
        defaultTriggerModes: ['manual', 'cron'],
        proofGoal: 'Show release gate.'
      }
    ],
    docs: {
      pricing: 'docs/offers/leion-delivery-pricing.md',
      proofScript: 'docs/proof/leion-delivery-demo-script.md'
    }
  };

  const model = buildControlPlaneDashboardModel([
    {
      id: 'run-1',
      name: 'delivery.issue-to-pr',
      timestamp: Date.parse('2026-03-22T10:00:00Z'),
      status: 'success',
      steps: [],
      pullRequests: [{ provider: 'github', url: 'https://github.com/acme/repo/pull/12', head: 'feature/12', base: 'main', title: 'fix: issue 12', timestamp: Date.parse('2026-03-22T10:04:00Z') }],
      audit: { hitl: [{ decision: 'approve' }] as any[] }
    },
    {
      id: 'run-2',
      name: 'delivery.release-gate',
      timestamp: Date.parse('2026-03-22T11:00:00Z'),
      status: 'failure',
      steps: []
    }
  ], catalog);

  assert.strictEqual(model.stats.totalRuns, 2);
  assert.strictEqual(model.stats.failures, 1);
  assert.strictEqual(model.stats.pullRequests, 1);
  assert.strictEqual(model.stats.approvals, 1);
  assert.strictEqual(model.stats.successRate, 50);
  assert.strictEqual(model.templates[0].lastRunStatus, 'success');
  assert.strictEqual(model.templates[2].lastRunStatus, 'failure');
  assert.strictEqual(model.templates[1].lastRunStatus, 'not_run');
  assert.strictEqual(model.plans.length, 5);
}

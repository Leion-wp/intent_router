import * as assert from 'assert';
import { buildSalesCockpitModel, coerceSalesCockpitState, createSalesCockpitProduct, normalizeSalesCockpitState, renderSalesTemplate, selectSalesCockpitProduct } from '../../utils/salesCockpitUtils';

export function run() {
  const cockpit = coerceSalesCockpitState({
    version: 3,
    weeklyTargets: {
      outbound: 100,
      discovery: 10,
      demos: 4,
      proposals: 2
    },
    leads: [
      {
        id: 'lead-1',
        company: 'Agency One',
        contactName: 'Alice',
        status: 'contacted',
        pain: 'Repeated GitHub delivery work',
        nextAction: 'Send pilot scope',
        owner: 'founder'
      },
      {
        id: 'lead-2',
        company: 'Agency Two',
        contactName: 'Bob',
        status: 'demo',
        pain: 'PR review bottlenecks',
        nextAction: 'Book technical demo',
        owner: 'founder'
      },
      {
        id: 'lead-3',
        company: 'Agency Three',
        contactName: 'Cara',
        status: 'proposal',
        pain: 'Need explicit approvals',
        nextAction: 'Review pricing',
        owner: 'founder'
      },
      {
        id: 'lead-4',
        company: 'Agency Four',
        contactName: 'Dan',
        status: 'lost',
        pain: 'No budget',
        nextAction: 'Stop',
        owner: 'founder'
      }
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Send pilot scope',
        status: 'todo',
        kind: 'proposal',
        owner: 'founder',
        dueDate: '2026-03-20'
      },
      {
        id: 'task-2',
        title: 'Follow up after demo',
        status: 'todo',
        kind: 'follow_up',
        owner: 'founder',
        dueDate: '2026-03-30'
      },
      {
        id: 'task-3',
        title: 'Archive closed-lost notes',
        status: 'done',
        kind: 'proof',
        owner: 'founder'
      }
    ],
    leadInbox: {
      candidates: [
        {
          id: 'candidate-1',
          company: 'Inbox Agency',
          sourceUrl: 'https://inbox-agency.example',
          sourceQuery: 'agency github workflow',
          snippet: 'Repeated GitHub delivery work',
          confidence: 0.78,
          status: 'candidate',
          discoveredAt: '2026-03-25T10:00:00.000Z'
        }
      ]
    }
  });

  const model = buildSalesCockpitModel(cockpit);

  assert.strictEqual(cockpit.offer.name.length > 0, true);
  assert.strictEqual(cockpit.funnel.acquisition.length > 0, true);
  assert.strictEqual(cockpit.providerAccounts.length >= 6, true);
  assert.strictEqual(cockpit.products.length >= 1, true);
  assert.strictEqual(cockpit.version, 4);
  assert.strictEqual(cockpit.leadInbox.candidates.length, 1);
  assert.strictEqual(cockpit.sheetBinding.tabs.leads, 'Leads');
  assert.strictEqual(cockpit.providerBindings.length >= 2, true);
  assert.strictEqual(cockpit.activityLog.length >= 1, true);
  assert.strictEqual(model.providerSummary.total >= 6, true);
  assert.strictEqual(model.productSummary.total >= 1, true);
  assert.strictEqual(model.metrics.find((metric) => metric.key === 'outbound')?.current, 3);
  assert.strictEqual(model.metrics.find((metric) => metric.key === 'discovery')?.current, 2);
  assert.strictEqual(model.metrics.find((metric) => metric.key === 'demos')?.current, 2);
  assert.strictEqual(model.metrics.find((metric) => metric.key === 'proposals')?.current, 1);
  assert.strictEqual(model.stageCounts.proposal, 1);
  assert.strictEqual(model.stageCounts.lost, 1);
  assert.strictEqual(model.leadInbox.candidates.length, 1);
  assert.strictEqual(Array.isArray(model.campaignQueue), true);
  assert.strictEqual(model.openTasks.length, 2);
  assert.strictEqual(model.overdueTasks >= 1, true);
  assert.strictEqual(model.openLeads.length, 3);

  const rendered = renderSalesTemplate(cockpit.templates[0], cockpit.leads[0]);
  assert.strictEqual(String(rendered.body).includes('Alice'), true);

  const secondProduct = createSalesCockpitProduct('Second SaaS');
  const switched = selectSalesCockpitProduct(normalizeSalesCockpitState({
    ...cockpit,
    products: [...cockpit.products, secondProduct]
  }), secondProduct.id);
  assert.strictEqual(switched.offer.name, 'Second SaaS');
}

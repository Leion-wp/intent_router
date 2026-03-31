import * as assert from 'assert';
import { coerceSalesCockpitState } from '../../utils/salesCockpitUtils';

export function run() {
  const migrated = coerceSalesCockpitState({
    version: 3,
    activeProductId: 'product-legacy',
    products: [
      {
        id: 'product-legacy',
        name: 'Legacy Product',
        slug: 'legacy-product',
        stage: 'offer',
        notes: 'legacy',
        offer: {
          name: 'Legacy Product',
          audience: 'Agences',
          problem: 'Prospection lente',
          promise: 'Cockpit interne',
          proof: 'Demo',
          callToAction: 'Book call'
        },
        funnel: {
          acquisition: 'Outbound',
          qualification: 'Qualif',
          demo: 'Demo',
          proposal: 'Proposal',
          close: 'Close'
        },
        weeklyTargets: {
          outbound: 10,
          discovery: 2,
          demos: 1,
          proposals: 1
        },
        leads: [
          {
            id: 'legacy-lead',
            company: 'Legacy Agency',
            contactName: '',
            role: '',
            status: 'target',
            pain: 'Prospection lente',
            nextAction: 'Review',
            owner: 'founder'
          }
        ],
        tasks: [],
        campaigns: [],
        templates: [],
        draftQueue: [],
        proofAssets: [],
        pipelinePaths: [],
        defaultSheetUrl: 'https://docs.google.com/spreadsheets/d/test/edit'
      }
    ],
    providerAccounts: []
  });

  assert.strictEqual(migrated.version, 4);
  assert.strictEqual(migrated.products.length, 1);
  assert.strictEqual(migrated.leads[0].status, 'reviewed');
  assert.strictEqual(migrated.sheetBinding.sheetUrl, 'https://docs.google.com/spreadsheets/d/test/edit');
  assert.strictEqual(migrated.leadInbox.candidates.length, 0);
  assert.strictEqual(migrated.activityLog.length >= 1, true);
}

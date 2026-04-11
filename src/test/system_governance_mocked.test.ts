import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { executeSystemBudgetGuard, executeSystemRateLimit, __test } = require('../../out/providers/systemAdapter');
Module.prototype.require = originalRequire;

suite('System Governance (Mocked)', () => {
  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    __test.resetRateLimitBuckets();
  });

  test('system.budget.guard passes below limit and returns utilization details', async () => {
    const result = await executeSystemBudgetGuard({
      label: 'api_spend',
      value: '42',
      limit: '100',
      unit: 'usd',
      warnAtPct: '80',
      mode: 'block'
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.statusText, 'Budget OK');
    assert.strictEqual(result.data.passed, true);
    assert.strictEqual(result.data.remaining, 58);
    assert.strictEqual(result.data.warning, false);
  });

  test('system.budget.guard warns when threshold is crossed but limit is not exceeded', async () => {
    const result = await executeSystemBudgetGuard({
      label: 'token_budget',
      value: '85',
      limit: '100',
      warnAtPct: '80',
      mode: 'warn'
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.statusText, 'Budget Warning');
    assert.strictEqual(result.data.warning, true);
    assert.strictEqual(result.data.exceeded, false);
  });

  test('system.budget.guard throws in block mode when limit is exceeded', async () => {
    await assert.rejects(
      executeSystemBudgetGuard({
        label: 'api_spend',
        value: '120',
        limit: '100',
        mode: 'block'
      }),
      /Budget guard failed/i
    );
  });

  test('system.rateLimit allows hits until the configured limit', async () => {
    const first = await executeSystemRateLimit({
      key: 'slack:ops',
      scope: 'notifications',
      limit: '2',
      windowMs: '60000',
      nowMs: '1000'
    });
    const second = await executeSystemRateLimit({
      key: 'slack:ops',
      scope: 'notifications',
      limit: '2',
      windowMs: '60000',
      nowMs: '2000'
    });

    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.data.allowed, true);
    assert.strictEqual(second.data.count, 2);
    assert.strictEqual(second.data.remaining, 0);
  });

  test('system.rateLimit throws in block mode when the limit is exceeded', async () => {
    await executeSystemRateLimit({
      key: 'webhook:test',
      limit: '1',
      windowMs: '30000',
      nowMs: '1000',
      mode: 'block'
    });

    await assert.rejects(
      executeSystemRateLimit({
        key: 'webhook:test',
        limit: '1',
        windowMs: '30000',
        nowMs: '2000',
        mode: 'block'
      }),
      /Rate limit exceeded/i
    );
  });

  test('system.rateLimit returns 429 in warn mode without throwing', async () => {
    await executeSystemRateLimit({
      key: 'email:followup',
      limit: '1',
      windowMs: '30000',
      nowMs: '1000',
      mode: 'warn'
    });

    const result = await executeSystemRateLimit({
      key: 'email:followup',
      limit: '1',
      windowMs: '30000',
      nowMs: '1500',
      mode: 'warn'
    });

    assert.strictEqual(result.status, 429);
    assert.strictEqual(result.statusText, 'Rate Limit Exceeded');
    assert.strictEqual(result.data.allowed, false);
  });
});

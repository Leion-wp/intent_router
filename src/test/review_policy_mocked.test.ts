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

const { evaluateReviewPolicy } = require('../../out/providers/vscodeAdapter');
Module.prototype.require = originalRequire;

suite('Review Policy (Mocked)', () => {
  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
  });

  test('warn mode reports violations but does not block', () => {
    mockVscode.__mock.configStore.set('intentRouter.policy.review.mode', 'warn');
    mockVscode.__mock.configStore.set('intentRouter.policy.review.blockedExtensions', ['.pem']);
    const result = evaluateReviewPolicy([
      { path: 'secrets/private.pem', added: 3, removed: 0 }
    ], { totalAdded: 3, totalRemoved: 0 });

    assert.strictEqual(result.mode, 'warn');
    assert.strictEqual(result.blocked, false);
    assert.ok(result.violations.some((entry: string) => entry.includes('blocked extension')));
  });

  test('block mode blocks when path pattern matches', () => {
    mockVscode.__mock.configStore.set('intentRouter.policy.review.mode', 'block');
    mockVscode.__mock.configStore.set('intentRouter.policy.review.blockedPaths', ['**/secrets/**']);
    const result = evaluateReviewPolicy([
      { path: 'src/secrets/token.txt', added: 1, removed: 1 }
    ], { totalAdded: 1, totalRemoved: 1 });

    assert.strictEqual(result.mode, 'block');
    assert.strictEqual(result.blocked, true);
    assert.ok(result.violations.some((entry: string) => entry.includes('blocked path')));
  });

  test('max changed lines guard triggers', () => {
    mockVscode.__mock.configStore.set('intentRouter.policy.review.mode', 'block');
    mockVscode.__mock.configStore.set('intentRouter.policy.review.maxChangedLines', 5);
    const result = evaluateReviewPolicy([
      { path: 'src/a.ts', added: 4, removed: 3 }
    ], { totalAdded: 4, totalRemoved: 3 });

    assert.strictEqual(result.blocked, true);
    assert.ok(result.violations.some((entry: string) => entry.includes('exceeds max')));
  });
});

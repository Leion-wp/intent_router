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

const { executeSystemPolicyCheck } = require('../../out/providers/systemAdapter');
Module.prototype.require = originalRequire;

suite('System Policy Check (Mocked)', () => {
  test('passes when all policy rules match', async () => {
    const result = await executeSystemPolicyCheck({
      subject: '{"channel":"email","body":"hello Matthieu"}',
      rules: JSON.stringify([
        { kind: 'equals', path: 'channel', value: 'email' },
        { kind: 'contains', path: 'body', value: 'Matthieu' }
      ])
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.statusText, 'Policy Passed');
    assert.strictEqual(result.data.passed, true);
    assert.strictEqual(result.data.violationCount, 0);
  });

  test('returns structured violations in warn mode', async () => {
    const result = await executeSystemPolicyCheck({
      subject: '{"channel":"slack","body":"hello world"}',
      mode: 'warn',
      rules: JSON.stringify([
        { kind: 'equals', path: 'channel', value: 'email', message: 'Only email channel is allowed.' },
        { kind: 'contains', path: 'body', value: 'Matthieu' }
      ])
    });

    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.statusText, 'Policy Violations');
    assert.strictEqual(result.data.passed, false);
    assert.strictEqual(result.data.violationCount, 2);
    assert.strictEqual(result.data.violations[0].message, 'Only email channel is allowed.');
  });

  test('throws in block mode when a rule is violated', async () => {
    await assert.rejects(
      executeSystemPolicyCheck({
        subject: '{"channel":"slack"}',
        mode: 'block',
        rules: JSON.stringify([
          { kind: 'equals', path: 'channel', value: 'email' }
        ])
      }),
      /Policy check failed/i
    );
  });
});

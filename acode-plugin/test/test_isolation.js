const assert = require('assert');
const { createAcodeEnvironment } = require('./harness');

async function testIsolation() {
  // First run
  const env1 = createAcodeEnvironment();
  assert.ok(env1.mocks.window.intentRouter, 'window.intentRouter should exist after init');

  env1.router.register('test:custom', () => 'env1_value');
  const res1 = await env1.router.route({ action: 'test:custom' });
  assert.strictEqual(res1.data, 'env1_value');

  // Destroy first environment
  await env1.destroy();
  assert.strictEqual(env1.mocks.window.intentRouter, undefined, 'window.intentRouter should be deleted on destroy');

  // Second run in fresh environment
  const env2 = createAcodeEnvironment();
  assert.ok(env2.mocks.window.intentRouter, 'window.intentRouter should exist in new env');

  const res2 = await env2.router.route({ action: 'test:custom' });
  assert.strictEqual(res2.success, false, 'Command from env1 should not exist in env2');
  assert.ok(res2.error.includes('Command test:custom not found'));

  await env2.destroy();
}

module.exports = testIsolation;

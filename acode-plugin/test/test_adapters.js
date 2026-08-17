const assert = require('assert');
const { createAcodeEnvironment } = require('./harness');

async function testAdapters() {
  const env = createAcodeEnvironment();
  const { router, mocks } = env;

  try {
    // 1. Terminal adapter tests
    const listResult = await router.route({ action: 'terminal:list' });
    assert.strictEqual(listResult.success, true);
    assert.deepStrictEqual(listResult.data, []);

    const execResult = await router.route({
      action: 'terminal:exec',
      data: { command: 'echo hello_acode', name: 'TestTerm' }
    });
    assert.strictEqual(execResult.success, true);
    assert.strictEqual(execResult.data.submitted, true);
    assert.strictEqual(execResult.data.command, 'echo hello_acode');

    assert.strictEqual(mocks.terminalExecutions.length, 1);
    assert.strictEqual(mocks.terminalExecutions[0].cmd, 'echo hello_acode\r');

    // 2. File system adapter tests
    const writeResult = await router.route({
      action: 'file:write',
      data: { path: 'file:///sdcard/project/test.txt', content: 'hello world' }
    });
    assert.strictEqual(writeResult.success, true);
    assert.strictEqual(writeResult.data.written, true);

    const existsResult = await router.route({
      action: 'file:exists',
      data: { path: 'file:///sdcard/project/test.txt' }
    });
    assert.strictEqual(existsResult.success, true);
    assert.strictEqual(existsResult.data.exists, true);

    const readResult = await router.route({
      action: 'file:read',
      data: { path: 'file:///sdcard/project/test.txt' }
    });
    assert.strictEqual(readResult.success, true);
    assert.strictEqual(readResult.data, 'hello world');

    const listFilesResult = await router.route({
      action: 'file:list',
      data: { path: 'file:///sdcard/project' }
    });
    assert.strictEqual(listFilesResult.success, true);
    assert.strictEqual(listFilesResult.data.length, 1);
    assert.strictEqual(listFilesResult.data[0].name, 'test.txt');

    const deleteResult = await router.route({
      action: 'file:delete',
      data: { path: 'file:///sdcard/project/test.txt' }
    });
    assert.strictEqual(deleteResult.success, true);

    const checkAfterDelete = await router.route({
      action: 'file:exists',
      data: { path: 'file:///sdcard/project/test.txt' }
    });
    assert.strictEqual(checkAfterDelete.data.exists, false);

  } finally {
    await env.destroy();
  }
}

module.exports = testAdapters;

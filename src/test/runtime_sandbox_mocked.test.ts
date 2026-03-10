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

const {
  detectIntentUsesNetwork,
  detectIntentWritesFiles,
  runPipelineFromData
} = require('../../out/pipelineRunner');
Module.prototype.require = originalRequire;

suite('Runtime Sandbox (Mocked)', () => {
  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowNetwork', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowFileWrite', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowedIntents', []);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.timeoutMs', 120000);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.maxCommandChars', 12000);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.maxNetworkOps', 40);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.maxFileWrites', 40);
  });

  test('detect network/file-write signatures', () => {
    assert.strictEqual(detectIntentUsesNetwork({ intent: 'http.request', payload: {} }), true);
    assert.strictEqual(detectIntentUsesNetwork({ intent: 'terminal.run', payload: { command: 'git pull' } }), true);
    assert.strictEqual(detectIntentUsesNetwork({ intent: 'system.setVar', payload: {} }), false);

    assert.strictEqual(detectIntentWritesFiles({ intent: 'vscode.reviewDiff', payload: {} }), true);
    assert.strictEqual(detectIntentWritesFiles({ intent: 'terminal.run', payload: { command: 'echo hi > out.txt' } }), true);
    assert.strictEqual(detectIntentWritesFiles({ intent: 'system.form', payload: {} }), false);
  });

  test('allowlist blocks disallowed intent', async () => {
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowedIntents', ['system.switch']);
    const pipeline = {
      name: 'sandbox-allowlist',
      steps: [
        { id: 's1', intent: 'terminal.run', payload: { command: 'echo sandbox' } }
      ]
    };
    const result = await runPipelineFromData(pipeline, true);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'failure');
  });
});

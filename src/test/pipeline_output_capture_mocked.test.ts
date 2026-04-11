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

const { runPipelineFromData } = require('../../out/pipelineRunner');
const { registerCapabilities, resetRegistry } = require('../../out/registry');
const { queryRunMemory } = require('../../out/runMemoryStore');
Module.prototype.require = originalRequire;

suite('Pipeline Output Capture (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;

  setup(async () => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/tmp/leion-output-capture' } }];
    mockVscode.__mock.configStore.set('intentRouter.memory.enabled', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowNetwork', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowFileWrite', true);
    resetRegistry();

    await mockVscode.commands.registerCommand('intentRouter.test.responseObject', async () => ({
      content: '{"ok":true}',
      status: 202,
      statusText: 'Accepted',
      data: { ok: true, source: 'test' }
    }));

    registerCapabilities({
      provider: 'test',
      type: 'vscode',
      capabilities: [
        {
          capability: 'test.responseObject',
          command: 'intentRouter.test.responseObject'
        }
      ]
    });
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
  });

  test('captures content, status code, status text, and data into variables', async () => {
    const result = await runPipelineFromData({
      name: 'output-capture',
      steps: [
        {
          id: 'call_provider',
          intent: 'test.responseObject',
          payload: {
            outputVar: 'response_body',
            outputVarStatusCode: 'response_status_code',
            outputVarStatusText: 'response_status_text',
            outputVarData: 'response_data'
          }
        },
        {
          id: 'save_result',
          intent: 'memory.save',
          payload: {
            sessionId: 'output-capture',
            key: 'vars',
            scope: 'variables',
            variableKeys: 'response_body,response_status_code,response_status_text,response_data'
          }
        }
      ]
    } as any, false);

    assert.strictEqual(result.success, true);
    const records = queryRunMemory({ sessionId: 'output-capture', key: 'vars', limit: 1 });
    assert.strictEqual(records.length, 1);
    const vars = records[0]?.data?.variables || {};
    assert.strictEqual(vars.response_body, '{"ok":true}');
    assert.strictEqual(vars.response_status_code, '202');
    assert.strictEqual(vars.response_status_text, 'Accepted');
    assert.ok(String(vars.response_data || '').includes('"source":"test"'));
  });
});

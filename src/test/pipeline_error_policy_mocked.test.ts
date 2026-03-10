import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
const { pipelineEventBus } = require('../../out/eventBus');
const { queryRunMemory } = require('../../out/runMemoryStore');
Module.prototype.require = originalRequire;

suite('Pipeline Error Policy (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  let tempRoot = '';

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-pipeline-error-policy-'));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: tempRoot } }];
    mockVscode.__mock.configStore.set('intentRouter.memory.enabled', true);
    mockVscode.__mock.configStore.set('intentRouter.memory.ttlDays', 30);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxRecordsPerSession', 200);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxPayloadChars', 120000);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowNetwork', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowFileWrite', true);
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('retry fixed emits retry logs then fails', async () => {
    const retryLogs: string[] = [];
    const disposable = pipelineEventBus.on((event: any) => {
      if (event?.type === 'stepLog' && String(event?.text || '').includes('[retry]')) {
        retryLogs.push(String(event.text));
      }
    });

    try {
      const pipeline = {
        name: 'retry-fixed',
        steps: [
          {
            id: 'broken_1',
            intent: 'nonexistent.capability',
            retry: { mode: 'fixed', maxAttempts: 3, delayMs: 1 }
          }
        ]
      };
      const result = await runPipelineFromData(pipeline as any, true);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'failure');
      assert.ok(retryLogs.length >= 2, `Expected at least 2 retry logs, got ${retryLogs.length}`);
    } finally {
      disposable.dispose();
    }
  });

  test('continueOnError captures error variable and continues flow', async () => {
    const pipeline = {
      name: 'continue-capture',
      steps: [
        {
          id: 'broken_1',
          intent: 'nonexistent.capability',
          continueOnError: true,
          captureErrorVar: 'last_error'
        },
        {
          id: 'switch_1',
          intent: 'system.switch',
          payload: {
            variableKey: 'last_error',
            routes: [
              {
                condition: 'contains',
                value: 'unsuccessful result',
                targetStepId: 'set_ok'
              }
            ],
            defaultStepId: 'set_fail'
          }
        },
        {
          id: 'set_ok',
          intent: 'system.setVar',
          payload: { name: 'verdict', value: 'continued' }
        },
        {
          id: 'set_fail',
          intent: 'system.setVar',
          payload: { name: 'verdict', value: 'failed' }
        },
        {
          id: 'save_result',
          intent: 'memory.save',
          payload: {
            sessionId: 'error-policy',
            key: 'result',
            scope: 'variables',
            variableKeys: 'verdict,last_error'
          }
        }
      ]
    };

    const result = await runPipelineFromData(pipeline as any, true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'success');

    const records = queryRunMemory({ sessionId: 'error-policy', key: 'result', limit: 1 });
    assert.strictEqual(records.length, 1);
    const vars = records[0]?.data?.variables || {};
    assert.strictEqual(vars.verdict, 'continued');
    assert.ok(String(vars.last_error || '').includes('nonexistent.capability'));
  });
});

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
const { queryRunMemory } = require('../../out/runMemoryStore');
const { registerSystemProvider } = require('../../out/providers/systemAdapter');
Module.prototype.require = originalRequire;

suite('Loop Node Runtime (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  let tempRoot = '';

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-loop-node-'));
    fs.mkdirSync(path.join(tempRoot, 'pipeline'), { recursive: true });
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: tempRoot } }];
    mockVscode.__mock.configStore.set('intentRouter.memory.enabled', true);
    mockVscode.__mock.configStore.set('intentRouter.memory.ttlDays', 30);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxRecordsPerSession', 500);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxPayloadChars', 120000);
    mockVscode.__mock.configStore.set('intentRouter.runtime.subPipeline.maxDepth', 4);
    registerSystemProvider({ subscriptions: [] } as any);
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('system.loop runs child pipeline for each item', async () => {
    const childPipeline = {
      name: 'child',
      steps: [
        {
          id: 'save_item',
          intent: 'memory.save',
          payload: {
            sessionId: 'loop-child',
            key: 'item',
            scope: 'variables',
            variableKeys: 'loop_item,loop_index'
          }
        }
      ]
    };
    fs.writeFileSync(
      path.join(tempRoot, 'pipeline', 'child.intent.json'),
      `${JSON.stringify(childPipeline, null, 2)}\n`,
      'utf8'
    );

    const parentPipeline = {
      name: 'parent',
      steps: [
        {
          id: 'loop_1',
          intent: 'system.loop',
          payload: {
            items: 'a,b,c',
            pipelinePath: 'pipeline/child.intent.json',
            itemVar: 'loop_item',
            indexVar: 'loop_index',
            maxIterations: 10,
            outputVar: 'loop_result'
          }
        },
        {
          id: 'save_parent',
          intent: 'memory.save',
          payload: {
            sessionId: 'loop-parent',
            key: 'summary',
            scope: 'variables',
            variableKeys: 'loop_result'
          }
        }
      ]
    };

    const result = await runPipelineFromData(parentPipeline as any, false);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'success');

    const childRecords = queryRunMemory({ sessionId: 'loop-child', key: 'item', mode: 'all', limit: 20 });
    assert.strictEqual(childRecords.length, 3);
    const seenItems = childRecords.map((entry: any) => String(entry?.data?.variables?.loop_item || ''));
    assert.ok(seenItems.includes('a'));
    assert.ok(seenItems.includes('b'));
    assert.ok(seenItems.includes('c'));

    const parentSummary = queryRunMemory({ sessionId: 'loop-parent', key: 'summary', limit: 1 });
    assert.strictEqual(parentSummary.length, 1);
    const loopResultRaw = String(parentSummary[0]?.data?.variables?.loop_result || '{}');
    const parsed = JSON.parse(loopResultRaw);
    assert.strictEqual(parsed.processedItems, 3);
    assert.strictEqual(parsed.successCount, 3);
  });
});

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
Module.prototype.require = originalRequire;

suite('Pipeline Memory Nodes (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  let tempRoot = '';

  setup(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-pipeline-memory-'));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: tempRoot } }];
    mockVscode.__mock.configStore.set('intentRouter.memory.enabled', true);
    mockVscode.__mock.configStore.set('intentRouter.memory.ttlDays', 30);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxRecordsPerSession', 200);
    mockVscode.__mock.configStore.set('intentRouter.memory.maxPayloadChars', 120000);
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('memory.save + memory.recall inject variables for later steps', async () => {
    const pipeline = {
      name: 'memory-nodes',
      steps: [
        { id: 'set1', intent: 'system.setVar', payload: { name: 'artifact', value: 'brainstorm.md' } },
        { id: 'save1', intent: 'memory.save', payload: { sessionId: 'factory', key: 'stage1', scope: 'variables', variableKeys: 'artifact' } },
        { id: 'set2', intent: 'system.setVar', payload: { name: 'artifact', value: 'overwritten.md' } },
        { id: 'recall1', intent: 'memory.recall', payload: { sessionId: 'factory', key: 'stage1', mode: 'latest', injectVars: true, injectPrefix: 'restored_' } },
        { id: 'save2', intent: 'memory.save', payload: { sessionId: 'factory', key: 'post_recall', scope: 'variables', variableKeys: 'restored_artifact' } }
      ]
    };

    const result = await runPipelineFromData(pipeline as any, true);
    assert.strictEqual(result.success, true);

    const postRecall = queryRunMemory({ sessionId: 'factory', key: 'post_recall', limit: 1 });
    assert.strictEqual(postRecall.length, 1);
    assert.strictEqual(postRecall[0].data.variables.restored_artifact, 'brainstorm.md');
  });

  test('memory.clear removes matching records', async () => {
    const pipeline = {
      name: 'memory-clear',
      steps: [
        { id: 'set1', intent: 'system.setVar', payload: { name: 'x', value: '1' } },
        { id: 'save1', intent: 'memory.save', payload: { sessionId: 'clear-demo', key: 'tmp', scope: 'variables', variableKeys: 'x' } },
        { id: 'clear1', intent: 'memory.clear', payload: { sessionId: 'clear-demo', key: 'tmp' } }
      ]
    };

    const result = await runPipelineFromData(pipeline as any, true);
    assert.strictEqual(result.success, true);
    const left = queryRunMemory({ sessionId: 'clear-demo', key: 'tmp', limit: 10 });
    assert.strictEqual(left.length, 0);
  });
});

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

const { saveRunMemory, queryRunMemory, clearRunMemory } = require('../../out/runMemoryStore');
Module.prototype.require = originalRequire;

suite('Run Memory Store v2 (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  let tempRoot = '';

  setup(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-run-memory-'));
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

  test('save/query memory records by session and key', () => {
    saveRunMemory({
      sessionId: 'team-alpha',
      key: 'brainstorm',
      scope: 'variables',
      data: { variables: { artifact: 'brainstorm.md' } }
    });
    saveRunMemory({
      sessionId: 'team-alpha',
      key: 'prd',
      scope: 'variables',
      data: { variables: { artifact: 'prd.md' } }
    });

    const entries = queryRunMemory({ sessionId: 'team-alpha', key: 'brainstorm', limit: 10 });
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].sessionId, 'team-alpha');
    assert.strictEqual(entries[0].key, 'brainstorm');
  });

  test('clear memory with keepLast', () => {
    saveRunMemory({ sessionId: 'team-beta', key: 'k', scope: 'raw', data: 'one' });
    saveRunMemory({ sessionId: 'team-beta', key: 'k', scope: 'raw', data: 'two' });
    saveRunMemory({ sessionId: 'team-beta', key: 'k', scope: 'raw', data: 'three' });

    const result = clearRunMemory({ sessionId: 'team-beta', key: 'k', keepLast: 1 });
    assert.strictEqual(result.removed, 2);
    const left = queryRunMemory({ sessionId: 'team-beta', key: 'k', limit: 10, newestFirst: false });
    assert.strictEqual(left.length, 1);
    assert.strictEqual(String(left[0].data), 'three');
  });
});

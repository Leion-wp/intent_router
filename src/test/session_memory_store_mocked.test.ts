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

const { appendSessionMemory, loadSessionMemory, exportSessionMemory, importSessionMemory, clearSessionMemory, summarizeSessionMemory } = require('../../out/sessionMemoryStore');
Module.prototype.require = originalRequire;

suite('Session Memory Store (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  let tempRoot = '';

  setup(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-session-'));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: tempRoot } }];
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('append/load session entries', () => {
    appendSessionMemory('team-alpha', [
      { member: 'writer_1', role: 'writer', path: 'docs/a.md', contentSnippet: 'A', timestamp: Date.now() }
    ]);
    const entries = loadSessionMemory('team-alpha');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].member, 'writer_1');
    assert.strictEqual(entries[0].path, 'docs/a.md');
  });

  test('export/import/clear roundtrip', () => {
    appendSessionMemory('team-beta', [
      { member: 'reviewer_1', role: 'reviewer', path: 'docs/b.md', contentSnippet: 'B', timestamp: Date.now() }
    ]);
    const exported = exportSessionMemory('team-beta');
    assert.ok(exported.includes('team-beta'));

    clearSessionMemory('team-beta');
    assert.strictEqual(loadSessionMemory('team-beta').length, 0);

    const imported = importSessionMemory(exported, 'merge');
    assert.strictEqual(imported.sessions, 1);
    assert.strictEqual(loadSessionMemory('team-beta').length, 1);

    const clearAll = clearSessionMemory();
    assert.ok(clearAll.clearedSessions >= 1);
  });

  test('summarize returns entry count and recent ordering', () => {
    const now = Date.now();
    appendSessionMemory('team-1', [
      { member: 'writer_1', role: 'writer', path: 'docs/a.md', contentSnippet: 'A', timestamp: now - 1000 }
    ]);
    appendSessionMemory('team-2', [
      { member: 'writer_2', role: 'writer', path: 'docs/b.md', contentSnippet: 'B', timestamp: now }
    ]);
    const all = summarizeSessionMemory();
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all[0].sessionId, 'team-2');
    assert.strictEqual(all[0].entries, 1);

    const scoped = summarizeSessionMemory('team-1');
    assert.strictEqual(scoped.length, 1);
    assert.strictEqual(scoped[0].sessionId, 'team-1');
  });
});

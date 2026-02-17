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

const { appendSessionMemory, loadSessionMemory } = require('../../out/sessionMemoryStore');
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
});

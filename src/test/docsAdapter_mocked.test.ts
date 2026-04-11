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

const { executeDocsSearchCommand, executeDocsWriteCommand, registerDocsProvider } = require('../../out/providers/docsAdapter');
const { listPublicCapabilities, resetRegistry } = require('../../out/registry');
Module.prototype.require = originalRequire;

suite('Docs Adapter (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-docs-'));
  const context: any = { subscriptions: [] };

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    resetRegistry();
    context.subscriptions.length = 0;
  });

  suiteTeardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    fs.rmSync(tempDir, { recursive: true, force: true });
    Module.prototype.require = originalRequire;
  });

  test('registers docs.write capability and command handler', () => {
    registerDocsProvider(context);
    const capabilities = listPublicCapabilities().filter((entry: any) => entry.capability === 'docs.write');
    assert.strictEqual(capabilities.length, 1);
    assert.strictEqual(capabilities[0].command, 'intentRouter.internal.docsWrite');
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.docsWrite'));
  });

  test('docs.search scans workspace files and returns ranked matches', async () => {
    const root = path.join(tempDir, 'workspace');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'guide.md'), [
      '# Guide',
      'This note mentions Leion Roots and needle search.',
      'Another line.'
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'notes.txt'), [
      'A second needle mention lives here.',
      'Needle appears again on another line.'
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const result = await executeDocsSearchCommand({
      query: 'needle',
      root: '.',
      include: '**/*',
      exclude: '**/binary.bin',
      maxResults: '5',
      caseSensitive: false
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.query, 'needle');
    assert.ok(result.data.matchCount >= 2);
    assert.ok(Array.isArray(result.data.matches));
    assert.ok(result.data.matches.some((match: any) => String(match.path).includes('notes.txt')));
    assert.ok(result.data.matches.some((match: any) => String(match.path).includes('guide.md')));
    assert.ok(String(result.content).includes('"matchCount"'));
  });

  test('docs.write writes and appends workspace files', async () => {
    const root = path.join(tempDir, 'workspace-write');
    fs.mkdirSync(root, { recursive: true });
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const first = await executeDocsWriteCommand({
      path: 'notes/output.md',
      content: 'Hello from docs.write'
    });

    assert.strictEqual(first.status, 201);
    assert.strictEqual(first.data.mode, 'overwrite');
    assert.strictEqual(fs.readFileSync(path.join(root, 'notes/output.md'), 'utf8'), 'Hello from docs.write');

    const second = await executeDocsWriteCommand({
      path: 'notes/output.md',
      content: '\nAppended line',
      append: true
    });

    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.data.mode, 'append');
    assert.strictEqual(fs.readFileSync(path.join(root, 'notes/output.md'), 'utf8'), 'Hello from docs.write\nAppended line');
  });
});

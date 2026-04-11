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

const { executeDbQueryCommand, executeDbWriteCommand, registerDbProvider } = require('../../out/providers/dbAdapter');
const { listPublicCapabilities, resetRegistry } = require('../../out/registry');
Module.prototype.require = originalRequire;

async function createSqliteFile(dbPath: string): Promise<void> {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`)
  });
  const db = new SQL.Database();
  db.run([
    'CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);',
    "INSERT INTO people (name) VALUES ('Matthieu');",
    "INSERT INTO people (name) VALUES ('Amina');"
  ].join('\n'));
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
}

suite('DB Adapter (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-db-'));
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

  test('registers db.write capability and command handler', () => {
    registerDbProvider(context);
    const capabilities = listPublicCapabilities().filter((entry: any) => entry.capability === 'db.write');
    assert.strictEqual(capabilities.length, 1);
    assert.strictEqual(capabilities[0].command, 'intentRouter.internal.dbWrite');
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.dbWrite'));
  });

  test('db.query executes a parameterized SQLite query', async () => {
    const root = path.join(tempDir, 'workspace');
    fs.mkdirSync(root, { recursive: true });
    const dbPath = path.join(root, 'people.sqlite');
    await createSqliteFile(dbPath);
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const result = await executeDbQueryCommand({
      databasePath: 'people.sqlite',
      query: 'SELECT id, name FROM people WHERE id = ? ORDER BY id;',
      paramsJson: '[2]'
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.rowCount, 1);
    assert.deepStrictEqual(result.data.columns, ['id', 'name']);
    assert.strictEqual(result.data.rows[0].name, 'Amina');
    assert.ok(String(result.content).includes('"Amina"'));
  });

  test('db.write persists a mutation to sqlite', async () => {
    const root = path.join(tempDir, 'workspace-write');
    fs.mkdirSync(root, { recursive: true });
    const dbPath = path.join(root, 'people.sqlite');
    await createSqliteFile(dbPath);
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const writeResult = await executeDbWriteCommand({
      databasePath: 'people.sqlite',
      query: 'INSERT INTO people (name) VALUES (?);',
      paramsJson: '["Mina"]'
    });

    assert.strictEqual(writeResult.status, 200);
    assert.strictEqual(writeResult.data.created, false);
    assert.ok(typeof writeResult.data.rowsModified === 'number');

    const readBack = await executeDbQueryCommand({
      databasePath: 'people.sqlite',
      query: 'SELECT name FROM people ORDER BY id;'
    });

    assert.strictEqual(readBack.data.rowCount, 3);
    assert.deepStrictEqual(readBack.data.rows.map((row: any) => row.name), ['Matthieu', 'Amina', 'Mina']);
  });
});

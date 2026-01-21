import * as assert from 'assert';

// Mock the vscode module BEFORE importing other modules
const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Now import the actual code to test
// We need to import the compiled JS because TS source imports 'vscode' which triggers the mock
// But we are in a TS test file.
// We can use 'require' to load the module under test.

const terminalAdapter = require('../../out/providers/terminalAdapter');
const router = require('../../out/router');

suite('Flow Logic Tests (Mocked)', () => {

    setup(() => {
        mockVscode.window.terminals.length = 0;
    });

    test('Terminal reuse logic (Integration)', async () => {
        const termName = 'Intent Router';

        // Execute command twice
        await terminalAdapter.executeTerminalCommand({ command: 'echo 1' });
        assert.strictEqual(mockVscode.window.terminals.length, 1);
        const t1 = mockVscode.window.terminals[0];
        assert.strictEqual(t1.name, termName);

        await terminalAdapter.executeTerminalCommand({ command: 'echo 2' });
        assert.strictEqual(mockVscode.window.terminals.length, 1);
        const t2 = mockVscode.window.terminals[0];
        assert.strictEqual(t1, t2);
    });

    test('Variable caching logic (Integration)', async () => {
        const cache = new Map<string, string>();

        // Mock input box to return a specific value
        mockVscode.window.showInputBox = async (opts: any) => {
            return 'user-value';
        };

        const input = 'Checkout ${input:Branch}';

        // First run: should call showInputBox
        const result1 = await router.resolveVariables(input, cache);
        assert.strictEqual(result1, 'Checkout user-value');
        assert.strictEqual(cache.size, 1);
        assert.strictEqual(cache.get('Branch'), 'user-value');

        // Modify cache manually to prove it's used
        cache.set('Branch', 'cached-value');

        // Second run: should use cache
        const result2 = await router.resolveVariables(input, cache);
        assert.strictEqual(result2, 'Checkout cached-value');
    });
});

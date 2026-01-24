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
// Note: We need to point to the compiled output because we are running node tests on compiled JS
const { installExtensions } = require('../../out/providers/vscodeAdapter');

suite('VSCode Adapter Tests (Mocked)', () => {
    let executedCommands: string[] = [];

    setup(() => {
        executedCommands = [];
        mockVscode.commands.executeCommand = async (cmd: string, arg: any) => {
            executedCommands.push(`${cmd}:${arg}`);
        };
    });

    test('should install extensions from string array', async () => {
        await installExtensions({ extensions: ['ext1', 'ext2'] });
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext1'));
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext2'));
    });

    test('should install extensions from multiline string', async () => {
        await installExtensions({ extensions: 'ext1\n  ext2 \n\n' });
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext1'));
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext2'));
    });

    test('should handle empty payload', async () => {
        await installExtensions({});
        assert.strictEqual(executedCommands.length, 0);
    });

    test('should handle invalid payload types', async () => {
         await installExtensions({ extensions: 123 });
         assert.strictEqual(executedCommands.length, 0);
    });
});

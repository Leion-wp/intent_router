import * as assert from 'assert';

// Mock vscode module
const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Import module under test
const { compileStep } = require('../../out/pipelineRunner');
const { resolveVariables } = require('../../out/router');

suite('Security Injection Test', () => {

    test('Exploit: terminal.run with unsanitized ${var:...} should now be SANITIZED', async () => {
        const store = new Map<string, any>();
        store.set('malicious', 'master; rm -rf /');

        const intent = {
            intent: 'terminal.run',
            payload: {
                command: 'git checkout ${var:malicious}'
            }
        };

        const compiled = await compileStep(intent, store, '/root', '/');
        // Expected (Secure behavior): Value is quoted
        assert.strictEqual(compiled.payload.command, 'git checkout "master; rm -rf /"');
    });

    test('Exploit: terminal.run with unsanitized ${input:...} should now be SANITIZED', async () => {
         // This tests resolveVariables directly from router.ts
         const cache = new Map<string, string>();
         cache.set('userInput', 'safe; rm -rf /');

         const input = 'echo ${input:userInput}';
         // Simulate what executeResolution does for terminal.run (passing true for sanitize)
         const resolved = await resolveVariables(input, cache, true);

         // Expected (Secure behavior): Value is quoted
         assert.strictEqual(resolved, 'echo "safe; rm -rf /"');
    });

});

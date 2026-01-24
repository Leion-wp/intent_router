import * as assert from 'assert';

// Mock vscode
const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Ensure we patch require for this test file execution if not already done
Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Import modules under test via require to trigger the mock
const { runPipelineFromData } = require('../../out/pipelineRunner');
const { pipelineEventBus } = require('../../out/eventBus');
const { executeTerminalCommand } = require('../../out/providers/terminalAdapter');

suite('Environment Injection Test (Mocked)', () => {
    let originalGetConfiguration: any;

    suiteSetup(() => {
        originalGetConfiguration = mockVscode.workspace.getConfiguration;
    });

    suiteTeardown(() => {
        mockVscode.workspace.getConfiguration = originalGetConfiguration;
        Module.prototype.require = originalRequire;
    });

    setup(() => {
        mockVscode.window.terminals.length = 0;
    });

    test('Env Vars in Pipeline Resolution', async () => {
        // Patch configuration mock
        let envConfig: any = undefined;
        mockVscode.workspace.getConfiguration = (section: string) => ({
            get: (key: string, def: any) => {
                if (key === 'environment') return envConfig || def;
                return def;
            },
            update: async (key: string, value: any) => {
                if (key === 'environment') envConfig = value;
            }
        });

        // 1. Set Config
        const config = mockVscode.workspace.getConfiguration('intentRouter');
        await config.update('environment', { "TEST_BRANCH": "feature-env-test" });

        // 2. Setup Listener
        let capturedDescription = '';
        const disposable = pipelineEventBus.on((e: any) => {
            if (e.type === 'stepStart') {
                capturedDescription = e.description || '';
            }
        });

        // 3. Run Pipeline
        const pipeline = {
            name: 'Test Env',
            steps: [{
                intent: 'git.checkout',
                payload: {
                    branch: '${var:TEST_BRANCH}',
                    create: true
                }
            }]
        };

        try {
            await runPipelineFromData(pipeline, true); // dryRun
        } finally {
            disposable.dispose();
        }

        // 4. Verify
        assert.ok(capturedDescription.includes('feature-env-test'), `Description should contain resolved var. Got: ${capturedDescription}`);
    });

    test('Env Vars in Terminal Creation', async () => {
        // Patch configuration mock
        let envConfig: any = undefined;
        mockVscode.workspace.getConfiguration = (section: string) => ({
            get: (key: string, def: any) => {
                if (key === 'environment') return envConfig || def;
                return def;
            },
            update: async (key: string, value: any) => {
                if (key === 'environment') envConfig = value;
            }
        });

        // 1. Set Config
        const config = mockVscode.workspace.getConfiguration('intentRouter');
        await config.update('environment', { "TERM_VAR": "123" });

        // 2. Execute Command
        await executeTerminalCommand({ command: 'echo hello' });

        // 3. Verify Terminal Options
        const term = mockVscode.window.terminals[0];
        assert.ok(term, 'Terminal should be created');

        const options = term.creationOptions;
        assert.strictEqual(options.env?.["TERM_VAR"], "123", "Terminal env should contain TERM_VAR");
    });

    test('Terminal Re-creation on Env Change', async () => {
        // Patch configuration mock
        let envConfig: any = { "INITIAL": "1" };
        mockVscode.workspace.getConfiguration = (section: string) => ({
            get: (key: string, def: any) => {
                if (key === 'environment') return envConfig || def;
                return def;
            },
            update: async (key: string, value: any) => {
                if (key === 'environment') envConfig = value;
            }
        });

        // 1. Create initial terminal
        await executeTerminalCommand({ command: 'echo 1' });
        const term1 = mockVscode.window.terminals[0];
        assert.ok(term1);
        assert.strictEqual(term1.creationOptions.env["INITIAL"], "1");

        // 2. Change Config
        envConfig = { "UPDATED": "2" };

        // 3. Execute Command again
        await executeTerminalCommand({ command: 'echo 2' });

        // 4. Verify
        // term1 should be disposed (removed from terminals)
        assert.ok(!mockVscode.window.terminals.includes(term1), 'Old terminal should be disposed');

        // New terminal should exist
        const term2 = mockVscode.window.terminals[0];
        assert.ok(term2);
        assert.notStrictEqual(term1, term2);
        assert.strictEqual(term2.creationOptions.env["UPDATED"], "2");
        assert.strictEqual(term2.creationOptions.env["INITIAL"], undefined);
    });
});

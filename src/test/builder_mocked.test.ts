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
const { PipelineBuilder } = require('../../out/pipelineBuilder');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('Pipeline Builder Tests (Mocked)', () => {
    let builder: any;
    let writtenFiles: any[] = [];

    setup(() => {
        if (mockVscode.__mock?.reset) {
            mockVscode.__mock.reset();
        }
        mockVscode.workspace.fs.writeFile = async (uri: any, content: any) => {
            writtenFiles.push({ uri, content: content.toString() });
        };
        writtenFiles = [];
        // Reset last panel
        if (mockVscode.window.getLastWebviewPanel()) {
             mockVscode.window.getLastWebviewPanel().dispose();
        }
        builder = new PipelineBuilder(mockVscode.Uri.file('/ext'));
    });

    test('Open Builder creates panel', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        assert.ok(panel);
        assert.strictEqual(panel.title, 'Pipeline Builder');
    });

    test('Save Pipeline message writes file', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();

        // Simulate Webview sending 'savePipeline'
        const pipelineData = { name: 'test-pipe', steps: [] };
        // The callback might be async in real life but here it is synchronous in our mock unless defined otherwise
        if (panel.postMessageCallback) {
            await panel.postMessageCallback({ type: 'savePipeline', pipeline: pipelineData });
        }

        assert.strictEqual(writtenFiles.length, 1);
        assert.ok(writtenFiles[0].uri.path.includes('test-pipe.intent.json'));
        assert.ok(writtenFiles[0].content.includes('test-pipe'));
    });

    test('Event forwarding to Webview', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();

        const receivedMessages: any[] = [];
        panel.onMessageReceived = (msg: any) => {
            receivedMessages.push(msg);
        };

        // Emit event
        pipelineEventBus.emit({
            type: 'stepStart',
            runId: '1',
            intentId: 'a',
            timestamp: 1,
            index: 0
        });

        const executionStatusMessages = receivedMessages.filter(m => m.type === 'executionStatus');
        assert.ok(executionStatusMessages.length >= 1);
        const message = executionStatusMessages[executionStatusMessages.length - 1];
        assert.strictEqual(message.status, 'running');
        assert.strictEqual(message.index, 0);
        assert.strictEqual(message.intentId, 'a');
    });

    test('Log forwarding to Webview', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();

        const receivedMessages: any[] = [];
        panel.onMessageReceived = (msg: any) => {
            receivedMessages.push(msg);
        };

        // Emit stepLog event
        pipelineEventBus.emit({
            type: 'stepLog',
            runId: '1',
            intentId: 'a',
            text: 'log line',
            stream: 'stdout'
        });

        const logMessages = receivedMessages.filter(m => m.type === 'stepLog');
        assert.ok(logMessages.length >= 1);
        const message = logMessages[logMessages.length - 1];
        assert.strictEqual(message.intentId, 'a');
        assert.strictEqual(message.text, 'log line');
    });

    test('Clear History message clears history and notifies webview', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();

        const { historyManager } = require('../../out/historyManager');
        historyManager.getHistory().push({ id: '1', name: 'run', timestamp: 1, status: 'success', steps: [] });

        const receivedMessages: any[] = [];
        panel.onMessageReceived = (msg: any) => {
            receivedMessages.push(msg);
        };

        if (panel.postMessageCallback) {
            await panel.postMessageCallback({ type: 'clearHistory' });
        }

        assert.strictEqual(historyManager.getHistory().length, 0);
        assert.ok(receivedMessages.some(m => m.type === 'historyUpdate' && Array.isArray(m.history) && m.history.length === 0));
    });

    test('openExternal message opens allowed URL', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        if (panel.postMessageCallback) {
            await panel.postMessageCallback({ type: 'openExternal', url: 'https://github.com/acme/repo/pull/1' });
        }
        assert.strictEqual(mockVscode.__mock.openedExternalUris.length, 1);
        assert.strictEqual(String(mockVscode.__mock.openedExternalUris[0].scheme), 'https');
    });

    test('copyToClipboard message writes clipboard text', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        if (panel.postMessageCallback) {
            await panel.postMessageCallback({ type: 'copyToClipboard', text: 'https://github.com/acme/repo/pull/2' });
        }
        assert.strictEqual(mockVscode.__mock.clipboardWrites.length, 1);
        assert.strictEqual(mockVscode.__mock.clipboardWrites[0], 'https://github.com/acme/repo/pull/2');
    });

    test('runPipeline forwards startStepId to command', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        const calls: any[] = [];
        const originalExecute = mockVscode.commands.executeCommand;
        mockVscode.commands.executeCommand = async (id: string, ...args: any[]) => {
            if (id === 'intentRouter.runPipelineFromData') {
                calls.push(args);
                return undefined;
            }
            return originalExecute(id, ...args);
        };
        const pipelineData = { name: 'resume-test', steps: [{ id: 'step.alpha' }] };
        try {
            if (panel.postMessageCallback) {
                await panel.postMessageCallback({ type: 'runPipeline', pipeline: pipelineData, dryRun: false, startStepId: 'step.alpha' });
            }
        } finally {
            mockVscode.commands.executeCommand = originalExecute;
        }
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], [pipelineData, false, 'step.alpha']);
    });

    test('exportRunAudit copies JSON to clipboard', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        const { historyManager } = require('../../out/historyManager');
        historyManager.getHistory().length = 0;
        historyManager.getHistory().push({
            id: 'run-1',
            name: 'run',
            timestamp: Date.now(),
            status: 'success',
            steps: [],
            audit: { timeline: [], hitl: [], reviews: [], cost: { estimatedTotal: 0, byIntent: {} } }
        });
        if (panel.postMessageCallback) {
            await panel.postMessageCallback({ type: 'exportRunAudit', runId: 'run-1' });
        }
        assert.strictEqual(mockVscode.__mock.clipboardWrites.length > 0, true);
        const last = mockVscode.__mock.clipboardWrites[mockVscode.__mock.clipboardWrites.length - 1];
        assert.strictEqual(String(last).includes('"runId": "run-1"'), true);
    });

    test('githubPrChecks message executes command and copies output', async () => {
        await builder.open();
        const panel = mockVscode.window.getLastWebviewPanel();
        const originalExecute = mockVscode.commands.executeCommand;
        mockVscode.commands.executeCommand = async (id: string, ..._args: any[]) => {
            if (id === 'intentRouter.internal.githubPrChecks') {
                return { output: 'check-a: pass' };
            }
            return originalExecute(id, ..._args);
        };
        try {
            if (panel.postMessageCallback) {
                await panel.postMessageCallback({ type: 'githubPrChecks', url: 'https://github.com/acme/repo/pull/9' });
            }
        } finally {
            mockVscode.commands.executeCommand = originalExecute;
        }
        const last = mockVscode.__mock.clipboardWrites[mockVscode.__mock.clipboardWrites.length - 1];
        assert.strictEqual(String(last).includes('check-a'), true);
    });
});

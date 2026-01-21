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

suite('Pipeline Builder Tests (Mocked)', () => {
    let builder: any;
    let writtenFiles: any[] = [];

    setup(() => {
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

        assert.strictEqual(receivedMessages.length, 1);
        assert.strictEqual(receivedMessages[0].type, 'executionStatus');
        assert.strictEqual(receivedMessages[0].status, 'running');
        assert.strictEqual(receivedMessages[0].index, 0);
    });
});

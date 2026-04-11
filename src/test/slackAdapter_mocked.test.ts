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

const { pipelineEventBus } = require('../../out/eventBus');
const { listPublicCapabilities, resetRegistry } = require('../../out/registry');
const { executeSlackListenCommand, executeSlackSendCommand, registerSlackProvider } = require('../../out/providers/slackAdapter');
Module.prototype.require = originalRequire;

function createMockResponse(body: any, status = 200, statusText = 'OK', contentType = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (name: string) => String(name || '').toLowerCase() === 'content-type' ? contentType : null
    },
    json: async () => typeof body === 'string' ? JSON.parse(body) : body,
    text: async () => payload
  };
}

suite('Slack Adapter (Mocked)', () => {
  const context: any = {
    subscriptions: []
  };
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  const originalFetch = (global as any).fetch;

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    resetRegistry();
    context.subscriptions.length = 0;
  });

  suiteTeardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    (global as any).fetch = originalFetch;
    Module.prototype.require = originalRequire;
  });

  test('registers slack.send and slack.listen capabilities', () => {
    registerSlackProvider(context);

    const capabilities = listPublicCapabilities().filter((entry: any) => entry.capability === 'slack.send' || entry.capability === 'slack.listen');
    assert.strictEqual(capabilities.length, 2);
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.slackSend'));
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.slackListen'));
  });

  test('slack.send uses preview fallback without a webhook', async () => {
    registerSlackProvider(context);
    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => events.push(event));

    try {
      const result = await executeSlackSendCommand({
        channel: '#general',
        text: 'Hello Slack',
        username: 'Leion Roots',
        mode: 'auto',
        __meta: {
          runId: 'run_slack_preview',
          traceId: 'trace_slack_preview',
          stepId: 'step_slack_preview'
        }
      });

      assert.strictEqual(result.status, 202);
      assert.strictEqual(result.statusText, 'Accepted');
      assert.strictEqual(result.data.deliveryMode, 'preview');
      assert.strictEqual(result.data.provider, 'slack');
      assert.ok(events.some((event) => event.type === 'stepLog' && String(event.text || '').includes('preview generated')));
    } finally {
      sub.dispose();
    }
  });

  test('slack.send posts to a webhook when provided', async () => {
    registerSlackProvider(context);
    const calls: Array<{ url: string; init: any }> = [];
    (global as any).fetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return createMockResponse({ ok: true, ts: '1234567890.1234' });
    };

    const result = await executeSlackSendCommand({
      webhookUrl: 'https://hooks.slack.com/services/T000/B000/XYZ',
      channel: '#ops',
      text: 'Deploy finished',
      mode: 'webhook'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://hooks.slack.com/services/T000/B000/XYZ');
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.deliveryMode, 'webhook');
    assert.strictEqual(result.data.channel, '#ops');
  });

  test('slack.listen reads items from a local JSONL queue file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-slack-'));
    fs.writeFileSync(path.join(root, 'leion-roots.slack.inbox.jsonl'), [
      JSON.stringify({ id: 'msg_1', channel: '#ops', text: 'First message', ts: '1001' }),
      JSON.stringify({ id: 'msg_2', channel: '#ops', text: 'Second message', ts: '1002' })
    ].join('\n'), 'utf8');
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const result = await executeSlackListenCommand({
      sourcePath: 'leion-roots.slack.inbox.jsonl',
      limit: 2
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.source, 'workspace_file');
    assert.strictEqual(result.data.itemCount, 2);
    assert.strictEqual(result.data.items[0].id, 'msg_1');
    assert.strictEqual(result.data.items[1].id, 'msg_2');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

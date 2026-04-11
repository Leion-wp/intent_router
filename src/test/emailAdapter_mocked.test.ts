import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

let hasGmailSession = false;
const draftCalls: Array<{ context: any; input: any }> = [];
const draftQueueCalls: Array<any> = [];

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  if (request === '../gmailOAuthService') {
    return {
      hasGmailOAuthSession: async () => hasGmailSession
    };
  }
  if (request === '../gmailDraftService') {
    return {
      createGmailDraft: async (context: any, input: any) => {
        draftCalls.push({ context, input });
        return {
          id: 'draft_123',
          message: {
            id: 'message_123',
            threadId: 'thread_123'
          }
        };
      },
      listGmailDraftQueue: async (context: any, limit: number) => {
        draftQueueCalls.push({ context, limit });
        return [
          {
            id: 'draft_queue_1',
            threadId: 'thread_queue_1',
            to: 'founder@example.com',
            subject: 'Reply needed',
            bodyPreview: 'Queued draft reply'
          }
        ];
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

const { pipelineEventBus } = require('../../out/eventBus');
const { listPublicCapabilities, resetRegistry } = require('../../out/registry');
const { executeEmailInboxCommand, executeEmailSendCommand, registerEmailProvider } = require('../../out/providers/emailAdapter');
Module.prototype.require = originalRequire;

suite('Email Adapter (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
  const context: any = {
    subscriptions: []
  };

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    resetRegistry();
    hasGmailSession = false;
    draftCalls.length = 0;
    draftQueueCalls.length = 0;
    context.subscriptions.length = 0;
  });

  suiteTeardown(() => {
    Module.prototype.require = originalRequire;
  });

  test('registers email.send capability and command handler', () => {
    registerEmailProvider(context);

    const capabilities = listPublicCapabilities().filter((entry: any) => entry.capability === 'email.send');
    assert.strictEqual(capabilities.length, 1);
    assert.strictEqual(capabilities[0].command, 'intentRouter.internal.emailSend');
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.emailSend'));
  });

  test('registers email.inbox capability and command handler', () => {
    registerEmailProvider(context);

    const capabilities = listPublicCapabilities().filter((entry: any) => entry.capability === 'email.inbox');
    assert.strictEqual(capabilities.length, 1);
    assert.strictEqual(capabilities[0].command, 'intentRouter.internal.emailInbox');
    assert.ok(mockVscode.__mock.commandHandlers.has('intentRouter.internal.emailInbox'));
  });

  test('uses preview fallback when no Gmail session exists', async () => {
    registerEmailProvider(context);
    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => events.push(event));

    try {
      const result = await executeEmailSendCommand(context, {
        to: 'alice@example.com, bob@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Preview mode',
        body: 'Hello from Leion Roots',
        mode: 'auto',
        __meta: {
          runId: 'run_email_preview',
          traceId: 'trace_email_preview',
          stepId: 'step_email_preview'
        }
      });

      assert.strictEqual(result.status, 202);
      assert.strictEqual(result.statusText, 'Accepted');
      assert.strictEqual(result.data.deliveryMode, 'preview');
      assert.strictEqual(result.data.transport, 'preview');
      assert.strictEqual(result.data.to.length, 2);
      assert.strictEqual(draftCalls.length, 0);
      assert.ok(String(result.content).includes('"deliveryMode": "preview"'));
      assert.ok(events.some((event) => event.type === 'stepLog' && String(event.text || '').includes('Preview generated')));
    } finally {
      sub.dispose();
    }
  });

  test('uses Gmail draft path when a Gmail session exists', async () => {
    registerEmailProvider(context);
    hasGmailSession = true;
    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => events.push(event));

    try {
      const result = await executeEmailSendCommand(context, {
        to: 'founder@example.com',
        subject: 'Launch plan',
        body: 'Draft body',
        mode: 'auto',
        __meta: {
          runId: 'run_email_draft',
          traceId: 'trace_email_draft',
          stepId: 'step_email_draft'
        }
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.statusText, 'Created');
      assert.strictEqual(result.data.deliveryMode, 'gmail_draft');
      assert.strictEqual(result.data.draftId, 'draft_123');
      assert.strictEqual(draftCalls.length, 1);
      assert.strictEqual(draftCalls[0].input.to, 'founder@example.com');
      assert.strictEqual(draftCalls[0].input.subject, 'Launch plan');
      assert.strictEqual(draftCalls[0].input.body, 'Draft body');
      assert.ok(events.some((event) => event.type === 'stepLog' && String(event.text || '').includes('Gmail draft created')));
    } finally {
      sub.dispose();
    }
  });

  test('reads inbox items from a local workspace file first', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-email-'));
    fs.writeFileSync(path.join(root, 'leion-roots.email.inbox.json'), JSON.stringify([
      {
        id: 'inbox_1',
        from: 'client@example.com',
        subject: 'Hello',
        snippet: 'Please reply',
        receivedAt: '2026-04-03T10:00:00.000Z'
      }
    ]), 'utf8');
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];

    const result = await executeEmailInboxCommand(context, {
      mode: 'auto',
      limit: 10,
      includeBody: false,
      __meta: {
        runId: 'run_email_inbox_file',
        traceId: 'trace_email_inbox_file',
        stepId: 'step_email_inbox_file'
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.source, 'workspace_file');
    assert.strictEqual(result.data.itemCount, 1);
    assert.strictEqual(result.data.items[0].id, 'inbox_1');
    assert.strictEqual(result.data.items[0].from, 'client@example.com');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('falls back to Gmail draft queue when no local inbox file exists', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leion-email-empty-'));
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: root, path: root } }];
    hasGmailSession = true;

    const result = await executeEmailInboxCommand(context, {
      mode: 'auto',
      limit: 5
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.source, 'gmail_draft_queue');
    assert.strictEqual(result.data.itemCount, 1);
    assert.strictEqual(result.data.items[0].id, 'draft_queue_1');
    assert.strictEqual(draftQueueCalls.length, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

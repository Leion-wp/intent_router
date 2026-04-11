import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { executeN8nManageCommand, executeN8nWebhookInvokeCommand } = require('../../out/providers/n8nAdapter');
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

suite('n8n Adapter (Mocked)', () => {
  const originalFetch = (global as any).fetch;

  suiteTeardown(() => {
    (global as any).fetch = originalFetch;
    Module.prototype.require = originalRequire;
  });

  test('n8n.manage listWorkflows calls the API with auth header and query params', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    (global as any).fetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return createMockResponse({ data: [{ id: 'wf_1', name: 'Workflow 1' }] });
    };

    const result = await executeN8nManageCommand({
      baseUrl: 'http://localhost:5678',
      apiKey: 'secret-key',
      operation: 'listWorkflows',
      active: 'true',
      limit: '25'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'http://localhost:5678/api/v1/workflows?active=true&limit=25');
    assert.strictEqual(calls[0].init.method, 'GET');
    assert.strictEqual(calls[0].init.headers['X-N8N-API-KEY'], 'secret-key');
    assert.ok(String(result.content).includes('Workflow 1'));
  });

  test('n8n.manage activateWorkflow targets the workflow activation endpoint', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    (global as any).fetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return createMockResponse({ data: { id: 'wf_123', active: true } });
    };

    const result = await executeN8nManageCommand({
      baseUrl: 'http://localhost:5678',
      apiKey: 'secret-key',
      operation: 'activateWorkflow',
      workflowId: 'wf_123'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'http://localhost:5678/api/v1/workflows/wf_123/activate');
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.ok(String(result.content).includes('"active": true'));
  });

  test('n8n.manage listExecutions forwards execution filters', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    (global as any).fetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return createMockResponse({ data: [{ id: 'exec_1', status: 'success' }] });
    };

    const result = await executeN8nManageCommand({
      baseUrl: 'http://localhost:5678',
      apiKey: 'secret-key',
      operation: 'listExecutions',
      workflowId: 'wf_123',
      status: 'success',
      includeData: 'true',
      limit: '10'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'http://localhost:5678/api/v1/executions?workflowId=wf_123&status=success&includeData=true&limit=10');
    assert.strictEqual(calls[0].init.method, 'GET');
    assert.ok(String(result.content).includes('exec_1'));
    assert.strictEqual(result.status, 200);
  });

  test('n8n.webhook.invoke forwards method, headers, and body', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    (global as any).fetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return createMockResponse({ status: 'ok' });
    };

    const result = await executeN8nWebhookInvokeCommand({
      url: 'http://localhost:5678/webhook-test/demo',
      method: 'POST',
      headers: '{"Content-Type":"application/json","X-Test":"1"}',
      body: '{"hello":"world"}'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'http://localhost:5678/webhook-test/demo');
    assert.strictEqual(calls[0].init.method, 'POST');
    assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json');
    assert.strictEqual(calls[0].init.headers['X-Test'], '1');
    assert.strictEqual(calls[0].init.body, '{"hello":"world"}');
    assert.ok(String(result.content).includes('"status": "ok"'));
  });
});

const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request maxResponseBytes bounds', () => {
  let router;
  let originalFetch;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  it('rejects invalid maxResponseBytes in network:request route', async () => {
    const invalidValues = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', null, true, false, {}, []];
    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: val }
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_max_bytes');
    }
  });

  it('rejects pre-read when Content-Length exceeds maxResponseBytes', async () => {
    let textCalled = false;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '2048']
      ]),
      text: async () => {
        textCalled = true;
        return JSON.stringify({ key: 'value' });
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/data.json', maxResponseBytes: 1024 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1024);
    assert.strictEqual(res.metadata.size, 2048);
    assert.strictEqual(textCalled, false, 'text() should not be called when Content-Length exceeds limit');
  });

  it('interrupts chunked response reader when cumulative size exceeds limit', async () => {
    let cancelCalled = false;
    let cancelReason = null;

    const chunks = [
      Buffer.from('chunk 1 (15 bytes)'),
      Buffer.from('chunk 2 (15 bytes)'),
      Buffer.from('chunk 3 (15 bytes)')
    ];

    let chunkIdx = 0;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: {
        getReader() {
          return {
            read: async () => {
              if (chunkIdx < chunks.length) {
                const val = chunks[chunkIdx++];
                return { done: false, value: val };
              }
              return { done: true, value: undefined };
            },
            cancel: async (reason) => {
              cancelCalled = true;
              cancelReason = reason;
            }
          };
        }
      }
    });

    // Limit to 20 bytes; chunk 1 (18 bytes) is fine, chunk 2 brings total to 36 bytes -> interrupt
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 20 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 20);
    assert.strictEqual(res.metadata.size, 36);
    assert.strictEqual(cancelCalled, true);
  });

  it('returns valid JSON body when under maxResponseBytes limit', async () => {
    const payload = { success: true, items: [1, 2, 3] };
    const payloadStr = JSON.stringify(payload);

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', String(payloadStr.length)]
      ]),
      text: async () => payloadStr
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/api', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, payload);
  });

  it('returns valid text body when under maxResponseBytes limit', async () => {
    const textContent = 'Hello World';

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain'],
        ['content-length', String(textContent.length)]
      ]),
      text: async () => textContent
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/file.txt', maxResponseBytes: 50 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.body, 'Hello World');
  });

  it('handles combination of timeoutMs and maxResponseBytes without resource leak', async () => {
    // 1. Timeout triggers first
    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const signal = options.signal;
        signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const timeoutRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/slow', maxResponseBytes: 1000, timeoutMs: 50 }
    });

    assert.strictEqual(timeoutRes.success, false);
    assert.strictEqual(timeoutRes.metadata.code, 'request_timeout');

    // 2. maxResponseBytes triggers first
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain'],
        ['content-length', '5000']
      ]),
      text: async () => '5000 bytes text'
    });

    const overflowRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/big', maxResponseBytes: 100, timeoutMs: 5000 }
    });

    assert.strictEqual(overflowRes.success, false);
    assert.strictEqual(overflowRes.metadata.code, 'response_too_large');
  });

  it('propagates maxResponseBytes and timeoutMs via github:request', async () => {
    let capturedOptions = null;

    globalThis.fetch = async (url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '10']
        ]),
        text: async () => '{"ok":true}'
      };
    };

    const res = await router.route({
      action: 'github:request',
      data: {
        path: '/user',
        token: 'secret',
        maxResponseBytes: 500,
        timeoutMs: 3000
      }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { ok: true });
    assert.ok(capturedOptions.signal);
  });

  it('propagates maxResponseBytes and timeoutMs via github:fetch_repo', async () => {
    let capturedData = null;

    router.register('github:request', async (data) => {
      capturedData = data;
      return { status: 200, body: [{ name: 'file.js' }] };
    });

    const res = await router.route({
      action: 'github:fetch_repo',
      data: {
        repo: 'owner/repo',
        path: 'src',
        token: 'secret',
        maxResponseBytes: 2048,
        timeoutMs: 1500
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(capturedData.maxResponseBytes, 2048);
    assert.strictEqual(capturedData.timeoutMs, 1500);
  });
});

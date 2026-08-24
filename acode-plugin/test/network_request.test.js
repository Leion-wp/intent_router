const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request and github:request maxResponseBytes bounds', () => {
  let router;
  let originalFetch;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects invalid maxResponseBytes and timeoutMs parameters', async () => {
    const invalidValues = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', true, false, {}, []];
    for (const val of invalidValues) {
      const resBytes = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: val }
      });
      assert.strictEqual(resBytes.success, false);
      assert.ok(resBytes.error.includes('Invalid maxBytes'));
      assert.strictEqual(resBytes.metadata.code, 'invalid_max_bytes');

      const resTimeout = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', timeoutMs: val }
      });
      assert.strictEqual(resTimeout.success, false);
      assert.ok(resTimeout.error.includes('Invalid timeoutMs'));
      assert.strictEqual(resTimeout.metadata.code, 'invalid_timeout_ms');
    }
  });

  it('returns valid JSON or text response under limit', async () => {
    // JSON test
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '18']
      ]),
      text: async () => '{"status":"ok"}'
    });

    const jsonRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/data.json', maxResponseBytes: 100 }
    });
    assert.strictEqual(jsonRes.success, true);
    assert.strictEqual(jsonRes.data.status, 200);
    assert.deepStrictEqual(jsonRes.data.body, { status: 'ok' });

    // Text test
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain'],
        ['content-length', '12']
      ]),
      text: async () => 'Hello World!'
    });

    const textRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/data.txt', maxResponseBytes: 100 }
    });
    assert.strictEqual(textRes.success, true);
    assert.strictEqual(textRes.data.status, 200);
    assert.strictEqual(textRes.data.body, 'Hello World!');
  });

  it('rejects request before reading body when Content-Length exceeds maxResponseBytes', async () => {
    let textCalled = false;
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '5000']
      ]),
      text: async () => {
        textCalled = true;
        return 'a'.repeat(5000);
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/large.json', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(textCalled, false, 'text() should not be called when Content-Length exceeds maxResponseBytes');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 5000);
    assert.ok(res.error.includes('Response size (5000 bytes) exceeds limit (1000 bytes)'));
  });

  it('interrupts streaming body reading and cancels reader when cumulative bytes exceed limit', async () => {
    let readerCancelled = false;

    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain']
        // No Content-Length (chunked)
      ]),
      body: {
        getReader: () => {
          let chunkIndex = 0;
          const chunks = [
            new TextEncoder().encode('chunk1-10b-'), // 11 bytes
            new TextEncoder().encode('chunk2-10b-'), // 11 bytes (total 22)
            new TextEncoder().encode('chunk3-10b-')  // 11 bytes
          ];
          return {
            read: async () => {
              if (chunkIndex < chunks.length) {
                return { done: false, value: chunks[chunkIndex++] };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => {
              readerCancelled = true;
            },
            releaseLock: () => {}
          };
        }
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 15 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(readerCancelled, true, 'Reader should be cancelled upon exceeding maxResponseBytes');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 15);
    assert.strictEqual(res.metadata.size, 22);
  });

  it('falls back to post-read byte check when body streaming reader is not available', async () => {
    let textCalled = false;
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain']
      ]),
      // No response.body / getReader
      text: async () => {
        textCalled = true;
        return 'This content is 31 bytes long!!';
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/fallback', maxResponseBytes: 20 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(textCalled, true);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 20);
    assert.strictEqual(res.metadata.size, 31);
  });

  it('propagates maxResponseBytes and timeoutMs through github:request and github:fetch_repo', async () => {
    let requestedUrl = null;
    let requestedHeaders = null;

    globalThis.fetch = async (url, opts) => {
      requestedUrl = url;
      requestedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '500']
        ]),
        text: async () => '{"name":"repo"}'
      };
    };

    // github:request under limit
    const ghRes = await router.route({
      action: 'github:request',
      data: {
        path: '/user',
        token: 'secret-token',
        maxResponseBytes: 1000,
        timeoutMs: 5000
      }
    });
    assert.strictEqual(ghRes.success, true);
    assert.strictEqual(requestedUrl, 'https://api.github.com/user');
    assert.strictEqual(requestedHeaders.Authorization, 'Bearer secret-token');

    // github:fetch_repo with Content-Length over limit
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '2000']
      ]),
      text: async () => 'huge payload'
    });

    const repoRes = await router.route({
      action: 'github:fetch_repo',
      data: {
        repo: 'owner/repo',
        path: 'src/main.js',
        maxResponseBytes: 500
      }
    });

    assert.strictEqual(repoRes.success, false);
    assert.strictEqual(repoRes.metadata.code, 'response_too_large');
    assert.strictEqual(repoRes.metadata.limit, 500);
    assert.strictEqual(repoRes.metadata.size, 2000);
  });

  it('handles timeoutMs correctly and cleans up timers without double error or leaking', async () => {
    globalThis.fetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/hang', timeoutMs: 50 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'timeout');
    assert.ok(res.error.includes('Request timed out after 50ms'));
  });
});

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
    globalThis.fetch = originalFetch;
  });

  it('rejects response with Content-Length exceeding limit before reading body', async () => {
    let bodyReadCalled = false;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-length' ? '10000' : null),
        entries: () => [['content-length', '10000']]
      },
      text: async () => {
        bodyReadCalled = true;
        return 'x'.repeat(10000);
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/bigfile.bin', maxResponseBytes: 5000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(bodyReadCalled, false, 'body text() should not be read when Content-Length exceeds limit');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 5000);
    assert.strictEqual(res.metadata.size, 10000);
  });

  it('interrupts chunked streaming response when accumulated bytes exceed limit', async () => {
    let readerCancelled = false;
    let chunksRead = 0;

    const chunks = [
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([6, 7, 8, 9, 10]),
      new Uint8Array([11, 12, 13, 14, 15])
    ];

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
        entries: () => []
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (chunksRead < chunks.length) {
              const value = chunks[chunksRead++];
              return { done: false, value };
            }
            return { done: true, value: undefined };
          },
          cancel: async () => {
            readerCancelled = true;
          }
        })
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 12 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(readerCancelled, true, 'reader.cancel() must be called when streaming bytes exceed limit');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 12);
    assert.strictEqual(res.metadata.size, 15);
  });

  it('returns JSON response body structure under limit when streaming reader is used', async () => {
    const jsonStr = JSON.stringify({ message: 'hello world', count: 42 });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonStr);

    let readCount = 0;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        entries: () => [['content-type', 'application/json']]
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (readCount === 0) {
              readCount++;
              return { done: false, value: bytes };
            }
            return { done: true, value: undefined };
          }
        })
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/api.json', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { message: 'hello world', count: 42 });
  });

  it('returns text response body structure under limit in non-streaming fallback mode', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'text/plain' : null),
        entries: () => [['content-type', 'text/plain']]
      },
      body: null, // No streaming reader
      text: async () => 'hello plain text'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/hello.txt', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.body, 'hello plain text');
  });

  it('triggers post-read guard in non-streaming fallback mode when size exceeds limit', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
        entries: () => []
      },
      body: null,
      text: async () => 'this content exceeds 10 bytes limit'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/hello.txt', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 35);
  });

  it('rejects invalid maxResponseBytes values with code invalid_max_bytes', async () => {
    const invalidValues = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', {}, []];

    for (const invalid of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/data', maxResponseBytes: invalid }
      });

      assert.strictEqual(res.success, false, `Should fail for invalid value: ${JSON.stringify(invalid)}`);
      assert.strictEqual(res.metadata.code, 'invalid_max_bytes');
    }
  });

  it('propagates maxResponseBytes through github:request and github:fetch_repo', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-length' ? '2000' : null),
        entries: () => [['content-length', '2000']]
      },
      text: async () => 'x'.repeat(2000)
    });

    // 1. github:request
    const ghReqRes = await router.route({
      action: 'github:request',
      data: { path: '/user', maxResponseBytes: 500 }
    });

    assert.strictEqual(ghReqRes.success, false);
    assert.strictEqual(ghReqRes.metadata.code, 'response_too_large');
    assert.strictEqual(ghReqRes.metadata.limit, 500);

    // 2. github:fetch_repo
    const ghRepoRes = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'owner/repo', maxResponseBytes: 500 }
    });

    assert.strictEqual(ghRepoRes.success, false);
    assert.strictEqual(ghRepoRes.metadata.code, 'response_too_large');
    assert.strictEqual(ghRepoRes.metadata.limit, 500);
  });

  it('handles timeoutMs and maxResponseBytes combination cleanly', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'text/plain' : null),
        entries: () => [['content-type', 'text/plain']]
      },
      body: null,
      text: async () => 'small ok response'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/small', maxResponseBytes: 1000, timeoutMs: 5000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.body, 'small ok response');
  });
});

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
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  function createMockResponse({
    status = 200,
    headers = {},
    bodyText = '',
    streamChunks = null
  }) {
    const headersMap = new Map(Object.entries(headers));
    const responseHeaders = {
      get: (key) => headersMap.get(key.toLowerCase()) ?? null,
      entries: () => headersMap.entries()
    };

    let body = null;
    if (streamChunks !== null) {
      let chunkIndex = 0;
      let isCanceled = false;
      body = {
        getReader: () => ({
          read: async () => {
            if (isCanceled || chunkIndex >= streamChunks.length) {
              return { done: true, value: undefined };
            }
            const chunk = streamChunks[chunkIndex++];
            const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
            return { done: false, value: bytes };
          },
          cancel: async () => {
            isCanceled = true;
          }
        })
      };
    }

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: responseHeaders,
      body,
      json: async () => JSON.parse(bodyText),
      text: async () => bodyText
    };
  }

  it('allows JSON and text responses under limit', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('json')) {
        return createMockResponse({
          headers: { 'content-type': 'application/json', 'content-length': '15' },
          bodyText: JSON.stringify({ ok: true })
        });
      }
      return createMockResponse({
        headers: { 'content-type': 'text/plain', 'content-length': '11' },
        bodyText: 'hello world'
      });
    };

    const resJson = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/json', maxResponseBytes: 100 }
    });
    assert.strictEqual(resJson.success, true);
    assert.deepStrictEqual(resJson.data.body, { ok: true });

    const resText = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 100 }
    });
    assert.strictEqual(resText.success, true);
    assert.strictEqual(resText.data.body, 'hello world');
  });

  it('rejects early when Content-Length exceeds limit', async () => {
    let textCalled = false;
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-length' ? '5000' : null),
        entries: () => [].values()
      },
      text: async () => {
        textCalled = true;
        return 'large content';
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/large', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(textCalled, false, 'Should reject before calling response.text()');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 5000);
  });

  it('interrupts streaming response exceeding limit', async () => {
    let canceled = false;
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      headers: {
        get: () => null,
        entries: () => [].values()
      },
      body: {
        getReader: () => {
          let count = 0;
          return {
            read: async () => {
              if (canceled || count >= 5) return { done: true, value: undefined };
              count++;
              return { done: false, value: new Uint8Array(10) }; // 10 bytes per chunk
            },
            cancel: async () => {
              canceled = true;
            }
          };
        }
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 25 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(canceled, true, 'Stream reader should be canceled upon exceeding limit');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 25);
    assert.strictEqual(res.metadata.size, 30);
  });

  it('falls back to getByteLength post-read when stream reader is unavailable', async () => {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      headers: {
        get: () => null,
        entries: () => [].values()
      },
      body: null,
      text: async () => '123456789012345'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/fallback', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 15);
  });

  it('rejects invalid maxResponseBytes values', async () => {
    globalThis.fetch = async () => createMockResponse({ bodyText: 'ok' });

    const invalidValues = [0, -10, NaN, Infinity, 'abc'];
    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com', maxResponseBytes: val }
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_max_bytes');
    }
  });

  it('propagates maxResponseBytes through github:request and github:fetch_repo', async () => {
    let capturedData = null;
    globalThis.fetch = async (url) => {
      return createMockResponse({
        headers: { 'content-type': 'application/json', 'content-length': '2000' },
        bodyText: JSON.stringify({ message: 'too large' })
      });
    };

    const resGhReq = await router.route({
      action: 'github:request',
      data: { path: '/user', maxResponseBytes: 500 }
    });

    assert.strictEqual(resGhReq.success, false);
    assert.strictEqual(resGhReq.metadata.code, 'response_too_large');
    assert.strictEqual(resGhReq.metadata.limit, 500);

    const resGhRepo = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'owner/repo', path: 'README.md', maxResponseBytes: 500 }
    });

    assert.strictEqual(resGhRepo.success, false);
    assert.strictEqual(resGhRepo.metadata.code, 'response_too_large');
    assert.strictEqual(resGhRepo.metadata.limit, 500);
  });
});

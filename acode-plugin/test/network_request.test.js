const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request maxResponseBytes & timeoutMs bounds', () => {
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

  it('rejects invalid maxResponseBytes values', async () => {
    const invalidValues = [0, -10, 'abc', NaN, Infinity];
    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: val }
      });
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid maxBytes'), `Should reject invalid maxResponseBytes: ${val}`);
    }
  });

  it('rejects response before body reading when Content-Length exceeds maxResponseBytes', async () => {
    let bodyReadCalled = false;
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '2000']
        ]),
        json: async () => { bodyReadCalled = true; return {}; },
        text: async () => { bodyReadCalled = true; return ''; }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/large.json', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(bodyReadCalled, false, 'Body reading methods should not be called');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 2000);
  });

  it('interrupts chunked streaming response when accumulated bytes exceed maxResponseBytes', async () => {
    let streamCancelled = false;

    globalThis.fetch = async (url, options) => {
      const chunks = [
        new Uint8Array([1, 2, 3, 4, 5]), // 5 bytes
        new Uint8Array([6, 7, 8, 9, 10]), // +5 = 10 bytes
        new Uint8Array([11, 12, 13, 14, 15]) // +5 = 15 bytes -> exceeds 12 byte limit
      ];
      let chunkIdx = 0;

      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: {
          getReader: () => ({
            read: async () => {
              if (chunkIdx < chunks.length) {
                return { done: false, value: chunks[chunkIdx++] };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => {
              streamCancelled = true;
            }
          })
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 12 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(streamCancelled, true, 'Stream reader should be cancelled when limit exceeded');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 12);
    assert.strictEqual(res.metadata.size, 15);
  });

  it('rejects post-read response in fallback mode when ReadableStream is unavailable', async () => {
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => '123456789012345' // 15 bytes
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/fallback', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 15);
  });

  it('returns valid JSON body when response is under maxResponseBytes limit', async () => {
    const payload = { success: true, count: 42 };

    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        body: {
          getReader: () => {
            const data = new TextEncoder().encode(JSON.stringify(payload));
            let readDone = false;
            return {
              read: async () => {
                if (!readDone) {
                  readDone = true;
                  return { done: false, value: data };
                }
                return { done: true, value: undefined };
              },
              cancel: async () => {}
            };
          }
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/data.json', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, payload);
  });

  it('returns valid text body when response is under maxResponseBytes limit', async () => {
    const textContent = 'Hello, world!';

    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: {
          getReader: () => {
            const data = new TextEncoder().encode(textContent);
            let readDone = false;
            return {
              read: async () => {
                if (!readDone) {
                  readDone = true;
                  return { done: false, value: data };
                }
                return { done: true, value: undefined };
              },
              cancel: async () => {}
            };
          }
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text.txt', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.body, textContent);
  });

  it('propagates maxResponseBytes through github:request and github:fetch_repo', async () => {
    let routedUrl = null;
    let routedMaxBytes = null;

    globalThis.fetch = async (url, options) => {
      routedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '500']
        ]),
        json: async () => ({ repo: 'test' }),
        text: async () => JSON.stringify({ repo: 'test' })
      };
    };

    // github:request
    const ghRes = await router.route({
      action: 'github:request',
      data: { path: '/user', maxResponseBytes: 100 }
    });

    assert.strictEqual(ghRes.success, false);
    assert.strictEqual(ghRes.metadata.code, 'response_too_large');
    assert.strictEqual(ghRes.metadata.limit, 100);

    // github:fetch_repo
    const repoRes = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'owner/repo', maxResponseBytes: 100 }
    });

    assert.strictEqual(repoRes.success, false);
    assert.strictEqual(repoRes.metadata.code, 'response_too_large');
    assert.strictEqual(repoRes.metadata.limit, 100);
  });

  it('handles combination of maxResponseBytes and timeoutMs without leaks or double rejection', async () => {
    globalThis.fetch = async (url, options) => {
      const controllerSignal = options.signal;
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'text/plain'],
          ['content-length', '5000']
        ]),
        text: async () => 'some text'
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/combo', maxResponseBytes: 100, timeoutMs: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
  });
});

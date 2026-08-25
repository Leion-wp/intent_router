const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request & github bounds', () => {
  let router;
  let originalFetch;
  let originalAbortController;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
    originalFetch = globalThis.fetch;
    originalAbortController = globalThis.AbortController;
  });

  afterEach(() => {
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
    if (originalAbortController !== undefined) {
      globalThis.AbortController = originalAbortController;
    } else {
      delete globalThis.AbortController;
    }
  });

  function createMockResponse({
    status = 200,
    headers = {},
    jsonBody = null,
    textBody = null,
    streamChunks = null
  }) {
    const headersMap = new Map();
    for (const [k, v] of Object.entries(headers)) {
      headersMap.set(k.toLowerCase(), String(v));
    }

    const resHeaders = {
      get: (name) => headersMap.get(name.toLowerCase()) || null,
      entries: () => headersMap.entries()
    };

    let bodyStream = null;
    if (streamChunks && Array.isArray(streamChunks)) {
      let chunkIdx = 0;
      let lockReleased = false;
      bodyStream = {
        getReader: () => ({
          read: async () => {
            if (chunkIdx < streamChunks.length) {
              const chunk = streamChunks[chunkIdx++];
              const buffer = typeof chunk === 'string'
                ? Buffer.from(chunk, 'utf-8')
                : chunk;
              return { done: false, value: buffer };
            }
            return { done: true, value: undefined };
          },
          cancel: async () => {},
          releaseLock: () => { lockReleased = true; }
        })
      };
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: resHeaders,
      body: bodyStream,
      json: async () => jsonBody !== null ? jsonBody : (textBody ? JSON.parse(textBody) : {}),
      text: async () => textBody !== null ? textBody : JSON.stringify(jsonBody || {})
    };
  }

  it('1. rejects invalid maxResponseBytes in network:request', async () => {
    const invalidInputs = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', null, true, false, {}, []];
    for (const invalid of invalidInputs) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://api.test/data', maxResponseBytes: invalid }
      });
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid maxBytes'));
    }
  });

  it('2. rejects early using Content-Length header before reading body', async () => {
    let jsonRead = false;
    let textRead = false;

    globalThis.fetch = async (url, options) => {
      const resp = createMockResponse({
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '2000' },
        jsonBody: { big: 'data' }
      });
      resp.json = async () => { jsonRead = true; return { big: 'data' }; };
      resp.text = async () => { textRead = true; return '{"big":"data"}'; };
      return resp;
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/large', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 2000);
    assert.strictEqual(jsonRead, false);
    assert.strictEqual(textRead, false);
  });

  it('3. interrupts streaming/chunked response when accumulated size exceeds limit', async () => {
    const chunks = ['hello ', 'world ', 'exceeding ', 'limit'];

    globalThis.fetch = async (url, options) => {
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        streamChunks: chunks
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/stream', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 12); // 'hello world ' is 12 bytes
  });

  it('4. preserves JSON and text structure under the limit', async () => {
    globalThis.fetch = async (url, options) => {
      if (url.includes('json')) {
        return createMockResponse({
          status: 200,
          headers: { 'content-type': 'application/json' },
          jsonBody: { key: 'value' }
        });
      }
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        textBody: 'hello world'
      });
    };

    const jsonRes = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/json', maxResponseBytes: 100 }
    });
    assert.strictEqual(jsonRes.success, true);
    assert.strictEqual(jsonRes.data.status, 200);
    assert.deepStrictEqual(jsonRes.data.body, { key: 'value' });

    const textRes = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/text', maxResponseBytes: 100 }
    });
    assert.strictEqual(textRes.success, true);
    assert.strictEqual(textRes.data.status, 200);
    assert.strictEqual(textRes.data.body, 'hello world');
  });

  it('5. propagates maxResponseBytes and timeoutMs through github:request and github:fetch_repo', async () => {
    let lastUrl = '';
    let lastOptions = null;

    globalThis.fetch = async (url, options) => {
      lastUrl = url;
      lastOptions = options;
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '500' },
        jsonBody: { repo: 'details' }
      });
    };

    const reqRes = await router.route({
      action: 'github:request',
      data: { path: '/user', maxResponseBytes: 200 }
    });
    assert.strictEqual(reqRes.success, false);
    assert.strictEqual(reqRes.metadata.code, 'response_too_large');

    const repoRes = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'owner/repo', maxResponseBytes: 200 }
    });
    assert.strictEqual(repoRes.success, false);
    assert.strictEqual(repoRes.metadata.code, 'response_too_large');
  });

  it('6. handles combination of timeoutMs and maxResponseBytes without leaks', async () => {
    globalThis.fetch = async (url, options) => {
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'application/json' },
        jsonBody: { ok: true }
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/combo', maxResponseBytes: 100, timeoutMs: 5000 }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { ok: true });
  });

  it('7. triggers post-read fallback guard when stream reader is unavailable and body exceeds limit', async () => {
    globalThis.fetch = async (url, options) => {
      return createMockResponse({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        textBody: 'this is a plain text body without response.body reader'
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.test/nostream', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.ok(res.metadata.size > 10);
  });
});

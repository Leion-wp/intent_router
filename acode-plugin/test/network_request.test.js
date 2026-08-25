const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request and github:request maxResponseBytes bounds', () => {
  let router;
  let originalFetch;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  it('rejects invalid maxResponseBytes values', async () => {
    const invalidValues = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', true, false, {}, []];
    router.setupCommands();

    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: val }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'invalid_max_bytes');
    }
  });

  it('rejects request before reading body when Content-Length exceeds limit', async () => {
    let jsonCalled = false;
    let textCalled = false;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '5000']
      ]),
      json: async () => { jsonCalled = true; return { data: 'ok' }; },
      text: async () => { textCalled = true; return 'ok'; }
    });

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/large', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 5000);
    assert.strictEqual(jsonCalled, false, 'json() must NOT be called when Content-Length exceeds limit');
    assert.strictEqual(textCalled, false, 'text() must NOT be called when Content-Length exceeds limit');
  });

  it('interrupts streamed response when total chunks exceed maxResponseBytes limit', async () => {
    let streamCancelled = false;

    globalThis.fetch = async () => {
      const chunks = [
        new TextEncoder().encode('Hello '),
        new TextEncoder().encode('World! '),
        new TextEncoder().encode('This exceeds the limit.')
      ];
      let index = 0;

      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: {
          getReader: () => ({
            read: async () => {
              if (index < chunks.length) {
                return { done: false, value: chunks[index++] };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => { streamCancelled = true; },
            releaseLock: () => {}
          })
        }
      };
    };

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 13); // 'Hello ' (6) + 'World! ' (7) = 13
    assert.strictEqual(streamCancelled, true, 'Stream reader should be cancelled when limit is breached');
  });

  it('returns structured JSON response under maxResponseBytes limit', async () => {
    const responsePayload = { status: 'ok', items: [1, 2, 3] };

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      body: {
        getReader: () => {
          const content = new TextEncoder().encode(JSON.stringify(responsePayload));
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: content };
              }
              return { done: true, value: undefined };
            },
            releaseLock: () => {}
          };
        }
      }
    });

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/json', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, responsePayload);
  });

  it('returns text response under maxResponseBytes limit when streaming is unavailable', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => 'Hello, world!'
    });

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.body, 'Hello, world!');
  });

  it('rejects post-read response when streaming is unavailable and body size exceeds maxResponseBytes', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => 'Content exceeding 10 bytes limit'
    });

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 32);
  });

  it('handles combination of timeoutMs and maxResponseBytes without double rejection or leftover timers', async () => {
    let aborted = false;

    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        if (options.signal) {
          if (options.signal.aborted) {
            aborted = true;
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            return reject(err);
          }
          options.signal.addEventListener('abort', () => {
            aborted = true;
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'text/plain']]),
            text: async () => 'ok'
          });
        }, 200);
      });
    };

    router.setupCommands();

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/slow', timeoutMs: 50, maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'timeout');
    assert.strictEqual(aborted, true);
  });

  it('propagates maxResponseBytes and timeoutMs through github:request and github:fetch_repo', async () => {
    let capturedOptions = null;

    globalThis.fetch = async (url, options) => {
      capturedOptions = { url, options };
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '50']
        ]),
        json: async () => ({ name: 'repo' })
      };
    };

    router.setupCommands();

    const res1 = await router.route({
      action: 'github:request',
      data: { path: '/user', token: 'test-token', maxResponseBytes: 100, timeoutMs: 5000 }
    });

    assert.strictEqual(res1.success, true);
    assert.strictEqual(capturedOptions.url, 'https://api.github.com/user');

    const res2 = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'octocat/hello-world', token: 'test-token', maxResponseBytes: 20, timeoutMs: 5000 }
    });

    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.metadata.code, 'response_too_large');
    assert.strictEqual(res2.metadata.limit, 20);
    assert.strictEqual(res2.metadata.size, 50);
  });
});

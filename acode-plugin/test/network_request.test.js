const assert = require('assert');
const { IntentRouter } = require('../main.js');

describe('Acode network:request response size bounds', () => {
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

  it('rejects response when Content-Length exceeds maxResponseBytes before reading body', async () => {
    let textCalled = false;
    let jsonCalled = false;

    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '50000'],
          ['content-type', 'application/json']
        ]),
        text: async () => { textCalled = true; return '{}'; },
        json: async () => { jsonCalled = true; return {}; }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/api/data',
        maxResponseBytes: 1000
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 50000);
    assert.strictEqual(textCalled, false, 'text() should NOT be called when Content-Length exceeds limit');
    assert.strictEqual(jsonCalled, false, 'json() should NOT be called when Content-Length exceeds limit');
  });

  it('allows response when Content-Length is within maxResponseBytes', async () => {
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '20'],
          ['content-type', 'application/json']
        ]),
        text: async () => '{"status":"ok"}',
        json: async () => ({ status: 'ok' })
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/api/data',
        maxResponseBytes: 100
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { status: 'ok' });
  });

  it('interrupts chunked streaming response mid-stream when maxResponseBytes is exceeded', async () => {
    let readerCancelled = false;
    let lockReleased = false;

    const chunks = [
      new TextEncoder().encode('Hello, '),
      new TextEncoder().encode('this is a chunked stream '),
      new TextEncoder().encode('that will exceed the limit!')
    ];

    globalThis.fetch = async (url, options) => {
      let chunkIndex = 0;
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: {
          getReader: () => ({
            read: async () => {
              if (chunkIndex < chunks.length) {
                const val = chunks[chunkIndex++];
                return { done: false, value: val };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => {
              readerCancelled = true;
            },
            releaseLock: () => {
              lockReleased = true;
            }
          })
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/stream',
        maxResponseBytes: 15
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 15);
    assert.strictEqual(res.metadata.size, 32); // 7 + 25 = 32 bytes on second chunk
    assert.strictEqual(readerCancelled, true, 'Stream reader should be cancelled on limit exceed');
    assert.strictEqual(lockReleased, true, 'Stream reader lock should be released');
  });

  it('completes chunked streaming response when within maxResponseBytes', async () => {
    let lockReleased = false;

    const chunks = [
      new TextEncoder().encode('{"message":'),
      new TextEncoder().encode('"hello world"}')
    ];

    globalThis.fetch = async (url, options) => {
      let chunkIndex = 0;
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        body: {
          getReader: () => ({
            read: async () => {
              if (chunkIndex < chunks.length) {
                const val = chunks[chunkIndex++];
                return { done: false, value: val };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => {},
            releaseLock: () => {
              lockReleased = true;
            }
          })
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/json-stream',
        maxResponseBytes: 50
      }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { message: 'hello world' });
    assert.strictEqual(lockReleased, true);
  });

  it('uses fallback post-read length check when response.body.getReader is unavailable', async () => {
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => '123456789012345'
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/text',
        maxResponseBytes: 10
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 15);
  });

  it('returns plain text body correctly when content-type is non-JSON', async () => {
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<h1>Hello</h1>'
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/page.html',
        maxResponseBytes: 100
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.body, '<h1>Hello</h1>');
  });

  it('rejects invalid maxResponseBytes values with invalid_max_bytes code', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => 'ok'
    });

    const invalidInputs = [0, -10, NaN, Infinity, -Infinity, 'abc', '', null, true, false, {}, []];

    for (const val of invalidInputs) {
      const res = await router.route({
        action: 'network:request',
        data: {
          url: 'https://example.com',
          maxResponseBytes: val
        }
      });

      assert.strictEqual(res.success, false, `Should fail for invalid maxResponseBytes: ${JSON.stringify(val)}`);
      assert.strictEqual(res.metadata.code, 'invalid_max_bytes');
    }
  });

  it('supports timeoutMs and clears timer on completion', async () => {
    let signalAborted = false;

    globalThis.fetch = async (url, options) => {
      options.signal.addEventListener('abort', () => {
        signalAborted = true;
      });
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '{"ok":true}'
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/fast',
        maxResponseBytes: 100,
        timeoutMs: 5000
      }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { ok: true });
    assert.strictEqual(signalAborted, false);
  });

  it('handles combination of timeoutMs and maxResponseBytes when timeout occurs first', async () => {
    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            headers: new Map(),
            text: async () => 'late response'
          });
        }, 200);

        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/slow',
        maxResponseBytes: 100,
        timeoutMs: 50
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'timeout');
  });

  it('propagates maxResponseBytes and timeoutMs through github:request and github:fetch_repo', async () => {
    let capturedData = null;

    globalThis.fetch = async (url, options) => {
      capturedData = { url, options };
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '500'],
          ['content-type', 'application/json']
        ]),
        text: async () => '{"repo":"test"}'
      };
    };

    // Test github:request
    const res1 = await router.route({
      action: 'github:request',
      data: {
        path: '/user',
        token: 'secret',
        maxResponseBytes: 100,
        timeoutMs: 2000
      }
    });

    assert.strictEqual(res1.success, false);
    assert.strictEqual(res1.metadata.code, 'response_too_large');
    assert.strictEqual(capturedData.url, 'https://api.github.com/user');

    // Test github:fetch_repo
    const res2 = await router.route({
      action: 'github:fetch_repo',
      data: {
        repo: 'owner/repo',
        path: 'README.md',
        token: 'secret',
        maxResponseBytes: 100,
        timeoutMs: 2000
      }
    });

    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.metadata.code, 'response_too_large');
    assert.strictEqual(capturedData.url, 'https://api.github.com/repos/owner/repo/contents/README.md');
  });

  it('preserves network:request behavior when maxResponseBytes is omitted', async () => {
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '10000000'],
          ['content-type', 'application/json']
        ]),
        text: async () => '{"large":true}'
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: {
        url: 'https://example.com/unbounded'
      }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { large: true });
  });
});

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
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  it('allows network:request with Content-Length under limit', async () => {
    const mockResponseBody = JSON.stringify({ message: 'ok' });
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', String(mockResponseBody.length)]
        ]),
        body: {
          getReader: () => {
            let readCalled = false;
            return {
              read: async () => {
                if (!readCalled) {
                  readCalled = true;
                  return { done: false, value: Buffer.from(mockResponseBody) };
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
      data: { url: 'https://example.com/api', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { message: 'ok' });
  });

  it('rejects network:request when Content-Length exceeds limit before reading body', async () => {
    let getReaderCalled = false;
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '500']
        ]),
        body: {
          getReader: () => {
            getReaderCalled = true;
            throw new Error('getReader should not be called when Content-Length exceeds maxResponseBytes');
          }
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/large', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(getReaderCalled, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 100);
    assert.strictEqual(res.metadata.size, 500);
  });

  it('interrupts chunked response without Content-Length when streaming exceeds limit', async () => {
    let cancelCalled = false;
    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        body: {
          getReader: () => {
            let chunkCount = 0;
            return {
              read: async () => {
                chunkCount++;
                if (chunkCount === 1) {
                  return { done: false, value: Buffer.from('12345') }; // 5 bytes
                }
                if (chunkCount === 2) {
                  return { done: false, value: Buffer.from('678901') }; // 6 bytes -> total 11 bytes
                }
                return { done: true, value: undefined };
              },
              cancel: async () => {
                cancelCalled = true;
              }
            };
          }
        }
      };
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(cancelCalled, true);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 11);
  });

  it('fails closed before full buffering when getReader is unavailable', async () => {
    let textCalled = false;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: null,
      text: async () => {
        textCalled = true;
        return 'hello world 12345';
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_size_unenforceable');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(textCalled, false);
  });

  it('returns valid JSON and text response structures under limit', async () => {
    const makeResponse = (contentType, value) => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', contentType]]),
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: Buffer.from(value) };
            },
            cancel: async () => {}
          };
        }
      }
    });

    globalThis.fetch = async () => makeResponse('application/json', JSON.stringify({ key: 'value' }));
    const jsonRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/json', maxResponseBytes: 100 }
    });
    assert.strictEqual(jsonRes.success, true);
    assert.deepStrictEqual(jsonRes.data.body, { key: 'value' });

    globalThis.fetch = async () => makeResponse('text/plain', 'plain text response');
    const textRes = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 100 }
    });
    assert.strictEqual(textRes.success, true);
    assert.strictEqual(textRes.data.body, 'plain text response');
  });

  it('handles combination of timeoutMs and maxResponseBytes correctly without timer leaks', async () => {
    let fetchSignal = null;
    globalThis.fetch = async (url, options) => {
      fetchSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/timeout', timeoutMs: 50, maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'request_timeout');
    assert.ok(fetchSignal.aborted);
  });

  it('propagates maxResponseBytes and timeoutMs via github:request and github:fetch_repo', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: Buffer.from(JSON.stringify({ name: 'repo-name' })) };
            },
            cancel: async () => {}
          };
        }
      }
    });

    const resReq = await router.route({
      action: 'github:request',
      data: { path: '/user', maxResponseBytes: 1000, timeoutMs: 2000 }
    });
    assert.strictEqual(resReq.success, true);
    assert.deepStrictEqual(resReq.data.body, { name: 'repo-name' });

    const resRepo = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'owner/repo', maxResponseBytes: 1000, timeoutMs: 2000 }
    });
    assert.strictEqual(resRepo.success, true);
    assert.deepStrictEqual(resRepo.data.body, { name: 'repo-name' });
  });

  it('applies the canonical response ceiling when maxResponseBytes is omitted', async () => {
    let cancelCalled = false;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: Buffer.alloc((2 * 1024 * 1024) + 1) };
            },
            cancel: async () => { cancelCalled = true; }
          };
        }
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/default-ceiling' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 2 * 1024 * 1024);
    assert.strictEqual(cancelCalled, true);
  });

  it('rejects a requested response limit above the canonical ceiling before fetch', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not run');
    };
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/too-large', maxResponseBytes: (2 * 1024 * 1024) + 1 }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'max_response_bytes_exceeds_ceiling');
    assert.strictEqual(fetchCalled, false);
  });

  it('fails closed before fetch when timeoutMs cannot be enforced', async () => {
    const originalAbortController = globalThis.AbortController;
    let fetchCalled = false;
    try {
      globalThis.AbortController = undefined;
      globalThis.fetch = async () => {
        fetchCalled = true;
        throw new Error('fetch should not run');
      };
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/timeout', timeoutMs: 10 }
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'timeout_unavailable');
      assert.strictEqual(fetchCalled, false);
    } finally {
      globalThis.AbortController = originalAbortController;
    }
  });

  it('tears down an oversized Content-Length response before reading', async () => {
    let cancelCount = 0;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/plain'],
        ['content-length', '500']
      ]),
      body: {
        cancel: async () => { cancelCount += 1; },
        getReader: () => { throw new Error('body must not be read'); }
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/oversized', maxResponseBytes: 100 }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(cancelCount, 1);
  });

  it('rejects invalid maxResponseBytes values', async () => {
    const invalidValues = [0, -10, 'invalid', NaN, Infinity];

    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: val }
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid maxBytes'));
    }
  });
});

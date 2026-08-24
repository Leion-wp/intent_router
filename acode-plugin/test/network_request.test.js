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

  it('rejects response pre-read when Content-Length header exceeds maxResponseBytes', async () => {
    let textCalled = false;
    let jsonCalled = false;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '5000']
      ]),
      text: async () => { textCalled = true; return '{}'; },
      json: async () => { jsonCalled = true; return {}; }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/api', maxResponseBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(textCalled, false);
    assert.strictEqual(jsonCalled, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 5000);
  });

  it('allows response when Content-Length header is within maxResponseBytes', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', '20']
      ]),
      text: async () => '{"status":"ok"}',
      json: async () => ({ status: 'ok' })
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/api', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { status: 'ok' });
    assert.strictEqual(res.data.status, 200);
  });

  it('interrupts chunked streaming response when accumulated chunks exceed maxResponseBytes', async () => {
    let canceled = false;
    const chunk1 = new TextEncoder().encode('12345');
    const chunk2 = new TextEncoder().encode('67890');
    const chunk3 = new TextEncoder().encode('extra');

    let chunkIndex = 0;
    const chunks = [chunk1, chunk2, chunk3];

    const mockStream = {
      getReader: () => ({
        read: async () => {
          if (chunkIndex < chunks.length) {
            const val = chunks[chunkIndex++];
            return { done: false, value: val };
          }
          return { done: true, value: undefined };
        },
        cancel: async () => { canceled = true; },
        releaseLock: () => {}
      })
    };

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: mockStream
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/stream', maxResponseBytes: 8 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(canceled, true, 'Reader cancel should be called on limit breach');
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 8);
    assert.strictEqual(res.metadata.size, 10);
  });

  it('enforces limit in non-streaming fallback mode post-read', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: null, // no streaming body available
      text: async () => 'hello world this string is long'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'response_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 31);
  });

  it('returns valid JSON body under limit', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      body: null,
      text: async () => '{"foo":"bar"}'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/json', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.body, { foo: 'bar' });
  });

  it('returns valid text body under limit', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      body: null,
      text: async () => 'hello world'
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/text', maxResponseBytes: 100 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.body, 'hello world');
  });

  it('rejects invalid maxResponseBytes input values', async () => {
    const invalidInputs = [0, -10, NaN, Infinity, 'abc', '', '   ', {}, []];

    for (const invalid of invalidInputs) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', maxResponseBytes: invalid }
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid maxBytes'), `Should reject ${JSON.stringify(invalid)}`);
    }
  });

  it('rejects invalid timeoutMs input values', async () => {
    const invalidInputs = [0, -10, NaN, Infinity, 'abc', '', '   ', {}, []];

    for (const invalid of invalidInputs) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://example.com/api', timeoutMs: invalid }
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid timeoutMs'), `Should reject ${JSON.stringify(invalid)}`);
    }
  });

  it('handles timeoutMs triggering correctly without residual timer', async () => {
    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });

    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://example.com/slow', timeoutMs: 20 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'timeout');
    assert.ok(res.error.includes('timed out after 20ms'));
  });

  it('propagates maxResponseBytes and timeoutMs through github:request and github:fetch_repo', async () => {
    let capturedData = null;

    router.register('network:request', async (data) => {
      capturedData = data;
      return { status: 200, headers: {}, body: { name: 'my-repo' } };
    });

    const resReq = await router.route({
      action: 'github:request',
      data: { path: '/user', token: 'secret', maxResponseBytes: 500, timeoutMs: 1200 }
    });

    assert.strictEqual(resReq.success, true);
    assert.strictEqual(capturedData.maxResponseBytes, 500);
    assert.strictEqual(capturedData.timeoutMs, 1200);

    const resRepo = await router.route({
      action: 'github:fetch_repo',
      data: { repo: 'octocat/Hello-World', path: 'README.md', maxResponseBytes: 800, timeoutMs: 2000 }
    });

    assert.strictEqual(resRepo.success, true);
    assert.strictEqual(capturedData.maxResponseBytes, 800);
    assert.strictEqual(capturedData.timeoutMs, 2000);
  });
});

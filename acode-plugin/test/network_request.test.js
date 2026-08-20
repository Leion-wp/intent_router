const assert = require('assert');
const http = require('http');
const { IntentRouter } = require('../main.js');

describe('Acode network:request and github:request maxResponseBytes bounds', () => {
  let server;
  let serverPort;
  let router;

  before((done) => {
    router = new IntentRouter();
    router.setupCommands();

    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/json-small') {
        const payload = JSON.stringify({ name: 'roots', ok: true });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        });
        res.end(payload);
      } else if (url.pathname === '/text-small') {
        const payload = 'Hello roots text';
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(payload)
        });
        res.end(payload);
      } else if (url.pathname === '/large-content-length') {
        const payload = 'A'.repeat(5000);
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': '5000'
        });
        res.end(payload);
      } else if (url.pathname === '/chunked-large') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        });
        res.write('A'.repeat(500));
        setTimeout(() => {
          res.write('B'.repeat(1000));
          setTimeout(() => {
            res.write('C'.repeat(1000));
            res.end();
          }, 20);
        }, 20);
      } else if (url.pathname === '/slow-response') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        setTimeout(() => {
          res.end('delayed');
        }, 300);
      } else if (url.pathname === '/api.github.com/repos/owner/repo/contents/file.txt') {
        const payload = JSON.stringify({ name: 'file.txt', content: 'hello' });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        });
        res.end(payload);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      done();
    });
  });

  after((done) => {
    server.close(done);
  });

  it('1. returns parsed JSON under limit with Content-Length', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/json-small`,
        maxResponseBytes: 1024
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { name: 'roots', ok: true });
  });

  it('2. returns text body under limit with Content-Length', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/text-small`,
        maxResponseBytes: 1024
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.body, 'Hello roots text');
  });

  it('3. rejects before body read when Content-Length exceeds maxResponseBytes', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/large-content-length`,
        maxResponseBytes: 1000
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'response_too_large');
    assert.strictEqual(res.limit, 1000);
    assert.strictEqual(res.size, 5000);
    assert.match(res.error, /Content-Length/);
  });

  it('4. interrupts chunked reading when streaming body exceeds maxResponseBytes', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/chunked-large`,
        maxResponseBytes: 800
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'response_too_large');
    assert.strictEqual(res.limit, 800);
    assert.strictEqual(res.size, 1500); // 500 + 1000 = 1500 > 800
  });

  it('5. rejects invalid maxResponseBytes values (0, negative, NaN, Infinity)', async () => {
    const invalidValues = [0, -100, NaN, Infinity, "invalid"];

    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        payload: {
          url: `http://127.0.0.1:${serverPort}/json-small`,
          maxResponseBytes: val
        }
      });

      assert.strictEqual(res.success, false, `Expected value ${val} to be rejected`);
      assert.match(res.error, /maxResponseBytes must be a positive finite number/);
    }
  });

  it('6. combination timeoutMs + maxResponseBytes: timeout wins on slow request', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/slow-response`,
        timeoutMs: 50,
        maxResponseBytes: 10000
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'request_timeout');
    assert.match(res.error, /timed out/);
  });

  it('7. combination timeoutMs + maxResponseBytes: size guard wins on large response', async () => {
    const res = await router.route({
      action: 'network:request',
      payload: {
        url: `http://127.0.0.1:${serverPort}/large-content-length`,
        timeoutMs: 5000,
        maxResponseBytes: 100
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'response_too_large');
    assert.strictEqual(res.limit, 100);
  });

  it('8. github:request propagates maxResponseBytes to network:request', async () => {
    // Test github:request handler directly with custom network:request mock router
    const customRouter = new IntentRouter();
    customRouter.setupCommands();
    let passedMaxBytes;

    customRouter.register('network:request', async (data) => {
      passedMaxBytes = data.maxResponseBytes;
      if (data.maxResponseBytes && data.maxResponseBytes < 100) {
        const err = new Error('Too large');
        err.code = 'response_too_large';
        err.limit = data.maxResponseBytes;
        err.size = 500;
        throw err;
      }
      return { status: 200, headers: {}, body: { repo: 'roots' } };
    });

    const res = await customRouter.route({
      action: 'github:request',
      payload: {
        path: '/repos/owner/repo',
        maxResponseBytes: 50
      }
    });

    assert.strictEqual(passedMaxBytes, 50);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'response_too_large');
    assert.strictEqual(res.limit, 50);
    assert.strictEqual(res.size, 500);
  });
});

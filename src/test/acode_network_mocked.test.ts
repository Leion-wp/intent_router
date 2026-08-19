import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function createMockEnvironment(mockFetch?: any, customGlobals: Record<string, any> = {}) {
  let timerIdCounter = 1;
  const activeTimers = new Set<number>();

  const customSetTimeout = (fn: Function, delay?: number, ...args: any[]) => {
    const id = timerIdCounter++;
    activeTimers.add(id);
    const nativeTimer = setTimeout(() => {
      activeTimers.delete(id);
      fn(...args);
    }, delay);
    (nativeTimer as any)._customId = id;
    return nativeTimer;
  };

  const customClearTimeout = (timer: any) => {
    if (timer) {
      if (timer._customId) {
        activeTimers.delete(timer._customId);
      }
      clearTimeout(timer);
    }
  };

  const globalRef = globalThis as any;
  const sandbox: any = {
    console: {
      log: () => {},
      error: () => {},
      warn: () => {}
    },
    setTimeout: customSetTimeout,
    clearTimeout: customClearTimeout,
    setInterval,
    clearInterval,
    Number,
    JSON,
    String,
    Object,
    Array,
    Map,
    Promise,
    Error,
    Date,
    isNaN,
    isFinite,
    AbortController: 'AbortController' in customGlobals ? customGlobals['AbortController'] : globalRef.AbortController,
    fetch: mockFetch || globalRef.fetch,
    window: {},
    navigator: { userAgent: 'MockAgent', platform: 'MockPlatform' },
    acode: {
      require: () => null,
      setPluginInit: () => {},
      setPluginUnmount: () => {}
    },
    getActiveTimerCount: () => activeTimers.size
  };

  sandbox.window.acode = sandbox.acode;
  sandbox.window.fetch = sandbox.fetch;

  const mainJsPath = path.resolve(__dirname, '../../acode-plugin/main.js');
  const code = fs.readFileSync(mainJsPath, 'utf-8');

  const context = vm.createContext(sandbox);
  vm.runInContext(code, context);

  const router = new sandbox.window.IntentRouter();
  router.setupCommands();
  return { router, sandbox };
}

suite('Acode Network Request Timeout & Cancellation (Mocked)', () => {

  test('mock fetch resolved immediately with timeoutMs', async () => {
    const mockFetch = async (url: string, options: any) => {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true, data: 'hello' })
      };
    };

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com/test', timeoutMs: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { success: true, data: 'hello' });
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

  test('mock fetch blocked triggers abort and returns timeout error', async () => {
    let abortedSignal = false;
    const mockFetch = (url: string, options: any) => {
      return new Promise((resolve, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            abortedSignal = true;
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com/slow', timeoutMs: 50 }
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Request timed out after 50ms'), `Expected timeout error, got: ${res.error}`);
    assert.strictEqual(abortedSignal, true);
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

  test('mock fetch rejected before timeout preserves original network error', async () => {
    const mockFetch = async () => {
      throw new Error('Connection refused');
    };

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com/fail', timeoutMs: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Connection refused');
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

  test('non-OK HTTP response before timeout preserves HTTP status behavior', async () => {
    const mockFetch = async () => {
      return {
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Internal Server Error'
      };
    };

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com/500', timeoutMs: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'HTTP 500: Internal Server Error');
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

  test('no timer leak across sequential requests', async () => {
    const mockFetchSuccess = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({})
    });

    const { router, sandbox } = createMockEnvironment(mockFetchSuccess);

    for (let i = 0; i < 5; i++) {
      await router.route({
        action: 'network:request',
        data: { url: `https://api.example.com/step${i}`, timeoutMs: 500 }
      });
      assert.strictEqual(sandbox.getActiveTimerCount(), 0);
    }
  });

  test('github:request propagates timeoutMs via network:request', async () => {
    let receivedTimeoutMs: number | undefined;
    const mockFetch = (url: string, options: any) => {
      return new Promise((resolve, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'github:request',
      data: { path: '/user', timeoutMs: 30 }
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Request timed out after 30ms'), `Expected timeout error, got: ${res.error}`);
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

  test('invalid timeoutMs values are rejected', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => ''
    });

    const { router } = createMockEnvironment(mockFetch);
    const invalidValues = [-100, 0, 'invalid', NaN, Infinity, false];

    for (const val of invalidValues) {
      const res = await router.route({
        action: 'network:request',
        data: { url: 'https://api.example.com', timeoutMs: val }
      });
      assert.strictEqual(res.success, false, `Expected failure for timeoutMs=${val}`);
      assert.ok(
        res.error.includes('Invalid timeoutMs'),
        `Expected 'Invalid timeoutMs' error for value ${val}, got: ${res.error}`
      );
    }
  });

  test('clear error message when AbortController is unsupported', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => ''
    });

    const { router } = createMockEnvironment(mockFetch, { AbortController: undefined });
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com', timeoutMs: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.ok(
      res.error.includes('AbortController unavailable'),
      `Expected AbortController error message, got: ${res.error}`
    );
  });

  test('without timeoutMs, existing behavior is preserved', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true })
    });

    const { router, sandbox } = createMockEnvironment(mockFetch);
    const res = await router.route({
      action: 'network:request',
      data: { url: 'https://api.example.com/no-timeout' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 200);
    assert.deepStrictEqual(res.data.body, { ok: true });
    assert.strictEqual(sandbox.getActiveTimerCount(), 0);
  });

});

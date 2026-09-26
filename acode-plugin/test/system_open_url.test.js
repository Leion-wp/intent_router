const assert = require('assert');
const { IntentRouter, validateOpenUrl } = require('../main.js');

describe('Acode system:open_url URL scheme validation', () => {
  let router;
  let openCalls;
  let originalWindowOpen;

  beforeEach(() => {
    openCalls = [];
    originalWindowOpen = globalThis.window ? globalThis.window.open : undefined;
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = {};
    }
    globalThis.window.open = (url, target) => {
      openCalls.push({ url, target });
    };

    router = new IntentRouter();
    router.isInitialized = true;
    router.setupCommands();
  });

  afterEach(() => {
    if (originalWindowOpen !== undefined) {
      globalThis.window.open = originalWindowOpen;
    } else {
      delete globalThis.window.open;
    }
  });

  it('validates HTTPS and HTTP URLs using validateOpenUrl helper', () => {
    assert.strictEqual(validateOpenUrl('https://example.com/path'), 'https://example.com/path');
    assert.strictEqual(validateOpenUrl('http://example.com'), 'http://example.com/');
    assert.strictEqual(validateOpenUrl('  HtTpS://example.com/foo  '), 'https://example.com/foo');
    assert.strictEqual(validateOpenUrl('HTTP://DOMAIN.COM/path?a=1#hash'), 'http://domain.com/path?a=1#hash');
  });

  it('rejects forbidden URL schemes via validateOpenUrl helper', () => {
    const testCases = [
      { input: 'javascript:alert(1)', expectedScheme: 'javascript' },
      { input: ' JAVASCRIPT:alert(1) ', expectedScheme: 'javascript' },
      { input: 'data:text/html,<h1>test</h1>', expectedScheme: 'data' },
      { input: 'file:///sdcard/Documents/secret.txt', expectedScheme: 'file' },
      { input: 'content://com.android.providers/1', expectedScheme: 'content' },
      { input: 'intent://example.com#Intent;scheme=https;end', expectedScheme: 'intent' },
      { input: 'tel:+33123456789', expectedScheme: 'tel' },
      { input: 'sms:+33123456789', expectedScheme: 'sms' },
      { input: 'myapp://open/page', expectedScheme: 'myapp' },
      { input: 'relative/path/to/file', expectedScheme: 'none' },
      { input: '/absolute/path/to/file', expectedScheme: 'none' }
    ];

    for (const tc of testCases) {
      assert.throws(
        () => validateOpenUrl(tc.input),
        (err) => {
          assert.strictEqual(err.code, 'url_scheme_not_allowed');
          assert.strictEqual(err.scheme, tc.expectedScheme);
          return true;
        },
        `Should reject URL scheme for input: ${tc.input}`
      );
    }
  });

  it('accepts valid https:// and http:// URLs via system:open_url route and invokes window.open exactly once', async () => {
    const res1 = await router.route({
      action: 'system:open_url',
      data: { url: 'https://example.com/path' }
    });
    assert.strictEqual(res1.success, true);
    assert.deepStrictEqual(res1.data, { opened: true });
    assert.strictEqual(openCalls.length, 1);
    assert.deepStrictEqual(openCalls[0], { url: 'https://example.com/path', target: '_system' });

    const res2 = await router.route({
      action: 'system:open_url',
      data: { url: '  HTTP://example.org/test  ' }
    });
    assert.strictEqual(res2.success, true);
    assert.deepStrictEqual(res2.data, { opened: true });
    assert.strictEqual(openCalls.length, 2);
    assert.deepStrictEqual(openCalls[1], { url: 'http://example.org/test', target: '_system' });
  });

  it('rejects forbidden schemes in system:open_url route and NEVER calls window.open', async () => {
    const forbiddenUrls = [
      { url: 'javascript:alert(1)', scheme: 'javascript' },
      { url: '  JAVASCRIPT:alert(1) ', scheme: 'javascript' },
      { url: 'data:text/html,hello', scheme: 'data' },
      { url: 'file:///sdcard/data.json', scheme: 'file' },
      { url: 'content://media/external', scheme: 'content' },
      { url: 'intent://launch', scheme: 'intent' },
      { url: 'tel:+1234567890', scheme: 'tel' },
      { url: 'sms:+1234567890', scheme: 'sms' },
      { url: 'customapp://launch', scheme: 'customapp' },
      { url: 'relative/file.html', scheme: 'none' },
      { url: '/absolute/file.html', scheme: 'none' }
    ];

    for (const item of forbiddenUrls) {
      const res = await router.route({
        action: 'system:open_url',
        data: { url: item.url }
      });

      assert.strictEqual(res.success, false, `Route should fail for ${item.url}`);
      assert.strictEqual(res.metadata.code, 'url_scheme_not_allowed');
      assert.strictEqual(res.metadata.scheme, item.scheme);
      assert.ok(res.error.includes('url_scheme_not_allowed') || res.error.includes('not allowed'));
    }

    assert.strictEqual(openCalls.length, 0, 'window.open must NEVER be called when URL scheme is rejected');
  });

  it('handles missing or empty url parameter and never invokes window.open', async () => {
    const invalidPayloads = [
      {},
      { url: '' },
      { url: '   ' },
      { url: null },
      { url: undefined }
    ];

    for (const payload of invalidPayloads) {
      const res = await router.route({
        action: 'system:open_url',
        data: payload
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('url is required'));
    }

    assert.strictEqual(openCalls.length, 0, 'window.open must NEVER be called for missing/empty url');
  });
});

const assert = require('assert');
const { IntentRouter, validateMaxBytes, getByteLength } = require('../main.js');

describe('Acode file:read maxBytes bounds', () => {
  let router;

  beforeEach(() => {
    router = new IntentRouter();
    router.isInitialized = true;
  });

  it('validates maxBytes parameter correctly', () => {
    assert.strictEqual(validateMaxBytes(100), 100);
    assert.strictEqual(validateMaxBytes('100'), 100);
    assert.strictEqual(validateMaxBytes(undefined), null);

    const invalidValues = [0, -10, NaN, Infinity, -Infinity, 'abc', '', '   ', null, true, false, {}, []];
    for (const val of invalidValues) {
      assert.throws(
        () => validateMaxBytes(val),
        (err) => err && (err.code === 'invalid_max_bytes' || err.message.includes('Invalid maxBytes')),
        `Should reject invalid maxBytes: ${JSON.stringify(val)}`
      );
    }
  });

  it('calculates UTF-8 byte length correctly', () => {
    assert.strictEqual(getByteLength('hello'), 5);
    assert.strictEqual(getByteLength('é'), 2);
    assert.strictEqual(getByteLength('€'), 3);
    assert.strictEqual(getByteLength('🩵'), 4);
    assert.strictEqual(getByteLength('ééééé'), 10);
    assert.strictEqual(getByteLength(Buffer.from('hello utf8')), 10);
  });

  it('handles UTF-8 surrogate counting correctly in manual JS fallback', () => {
    const originalTextEncoder = globalThis.TextEncoder;
    const originalBuffer = globalThis.Buffer;

    try {
      delete globalThis.TextEncoder;
      delete globalThis.Buffer;

      const testCases = [
        { input: 'A', expected: 1 },
        { input: '€', expected: 3 },
        { input: '\uD83D\uDE00', expected: 4 }, // 😀 emoji, valid pair
        { input: '\uD800', expected: 3 },       // isolated high surrogate
        { input: '\uDC00', expected: 3 },       // isolated low surrogate
        { input: '\uD800A', expected: 4 },      // isolated high surrogate + A (3 + 1)
        { input: '\uD800€', expected: 6 },      // isolated high surrogate + € (3 + 3)
        { input: '\uD800\uD800', expected: 6 }, // two high surrogates (3 + 3)
        { input: '\uDC00\uDC00', expected: 6 }, // two low surrogates (3 + 3)
        { input: '\uDC00\uD800', expected: 6 }, // low surrogate followed by high surrogate (3 + 3)
        { input: '\uD800\uDE00\uD800', expected: 7 } // valid pair (4) + isolated high surrogate (3)
      ];

      for (const tc of testCases) {
        const manualLen = getByteLength(tc.input);
        assert.strictEqual(
          manualLen,
          tc.expected,
          `Fallback mismatch for ${JSON.stringify(tc.input)}: expected ${tc.expected}, got ${manualLen}`
        );

        if (originalTextEncoder) {
          const teLen = new originalTextEncoder().encode(tc.input).length;
          assert.strictEqual(
            manualLen,
            teLen,
            `Fallback differs from TextEncoder for ${JSON.stringify(tc.input)}: fallback ${manualLen}, TextEncoder ${teLen}`
          );
        }
      }
    } finally {
      if (originalTextEncoder !== undefined) globalThis.TextEncoder = originalTextEncoder;
      if (originalBuffer !== undefined) globalThis.Buffer = originalBuffer;
    }
  });

  it('rejects bounded read when isolated surrogate content exceeds limit in fallback mode', async () => {
    const originalTextEncoder = globalThis.TextEncoder;
    const originalBuffer = globalThis.Buffer;

    try {
      delete globalThis.TextEncoder;
      delete globalThis.Buffer;

      // '\uD800€' is 6 bytes in UTF-8 fallback mode (3 for \uD800 + 3 for €)
      const mockFs = (path) => ({
        stat: async () => ({}), // no size from stat
        readFile: async () => '\uD800€'
      });

      router.modules.fs = mockFs;
      router.setupCommands();

      // Limit set to 5 bytes; old buggy fallback counted 4 bytes and would wrongly allow this read.
      const res = await router.route({
        action: 'file:read',
        data: { path: '/surrogate.txt', maxBytes: 5 }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.metadata.code, 'file_too_large');
      assert.strictEqual(res.metadata.limit, 5);
      assert.strictEqual(res.metadata.size, 6);
    } finally {
      if (originalTextEncoder !== undefined) globalThis.TextEncoder = originalTextEncoder;
      if (originalBuffer !== undefined) globalThis.Buffer = originalBuffer;
    }
  });

  it('rejects pre-read when stat().size > maxBytes without calling readFile()', async () => {
    let readFileCalled = false;
    let statCalled = false;

    const mockFs = (path) => ({
      stat: async () => {
        statCalled = true;
        return { size: 2000 };
      },
      readFile: async () => {
        readFileCalled = true;
        return 'large content';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.log', maxBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(statCalled, true);
    assert.strictEqual(readFileCalled, false, 'readFile() must NOT be called when stat().size > maxBytes');
    assert.strictEqual(res.metadata.code, 'file_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 2000);
  });

  it('allows reading when stat().size <= maxBytes', async () => {
    let readFileCalled = false;

    const mockFs = (path) => ({
      stat: async () => ({ size: 500 }),
      readFile: async () => {
        readFileCalled = true;
        return 'hello world';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.log', maxBytes: 1000 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(res.data, 'hello world');
  });

  it('triggers post-read guard when stat() returns no size or fails', async () => {
    let readFileCalled = false;

    const mockFs = (path) => ({
      stat: async () => {
        throw new Error('stat unsupported on virtual FS');
      },
      readFile: async () => {
        readFileCalled = true;
        return 'this content exceeds ten bytes limit';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.log', maxBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(res.metadata.code, 'file_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 36);
  });

  it('allows file content exactly at maxBytes limit', async () => {
    const mockFs = (path) => ({
      stat: async () => ({ size: 10 }),
      readFile: async () => '1234567890'
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.log', maxBytes: 10 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data, '1234567890');
  });

  it('handles multi-byte UTF-8 string encoding byte length limits', async () => {
    const mockFs = (path) => ({
      stat: async () => ({}), // no size from stat
      readFile: async () => 'éééééé' // 6 chars, but 12 bytes in UTF-8
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.txt', maxBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'file_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 12);
  });

  it('rejects invalid maxBytes values in route execution', async () => {
    const mockFs = (path) => ({
      stat: async () => ({ size: 10 }),
      readFile: async () => 'hello'
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const invalidInputs = [0, -5, 'invalid', ''];
    for (const invalid of invalidInputs) {
      const res = await router.route({
        action: 'file:read',
        data: { path: '/test.log', maxBytes: invalid }
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Invalid maxBytes'));
    }
  });

  it('preserves existing file:read behavior when maxBytes is omitted', async () => {
    let readFileCalled = false;

    const mockFs = (path) => ({
      stat: async () => ({ size: 50000000 }),
      readFile: async () => {
        readFileCalled = true;
        return 'unbounded file content';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'file:read',
      data: { path: '/test.log' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(res.data, 'unbounded file content');
  });
});

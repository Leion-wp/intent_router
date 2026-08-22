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

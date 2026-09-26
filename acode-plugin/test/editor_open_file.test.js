const assert = require('assert');
const { IntentRouter, DEFAULT_EDITOR_MAX_BYTES } = require('../main.js');

describe('Acode editor:open_file maxBytes bounds', () => {
  let router;
  let addNewFileCalled = false;
  let addNewFileArgs = null;

  beforeEach(() => {
    addNewFileCalled = false;
    addNewFileArgs = null;
    global.editorManager = {
      addNewFile: async (filename, options) => {
        addNewFileCalled = true;
        addNewFileArgs = { filename, options };
        return { id: 'file_123', filename, ...options };
      }
    };

    router = new IntentRouter();
    router.isInitialized = true;
  });

  afterEach(() => {
    delete global.editorManager;
  });

  it('rejects pre-read when stat().size > maxBytes without calling readFile() or addNewFile()', async () => {
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
      action: 'editor:open_file',
      data: { path: '/test.log', maxBytes: 1000 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(statCalled, true);
    assert.strictEqual(readFileCalled, false, 'readFile() must NOT be called when stat().size > maxBytes');
    assert.strictEqual(addNewFileCalled, false, 'addNewFile() must NOT be called on rejection');
    assert.strictEqual(res.metadata.code, 'editor_file_too_large');
    assert.strictEqual(res.metadata.limit, 1000);
    assert.strictEqual(res.metadata.size, 2000);
  });

  it('allows reading and opening file when stat().size <= maxBytes', async () => {
    let readFileCalled = false;

    const mockFs = (path) => ({
      stat: async () => ({ size: 500 }),
      readFile: async () => {
        readFileCalled = true;
        return 'hello editor';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/test.txt', maxBytes: 1000, name: 'custom.txt' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(addNewFileCalled, true);
    assert.strictEqual(addNewFileArgs.filename, 'custom.txt');
    assert.strictEqual(addNewFileArgs.options.text, 'hello editor');
    assert.strictEqual(res.data.opened, true);
    assert.strictEqual(res.data.id, 'file_123');
  });

  it('triggers post-read guard when stat() returns no size or fails, avoiding addNewFile()', async () => {
    let readFileCalled = false;

    const mockFs = (path) => ({
      stat: async () => {
        throw new Error('stat unsupported');
      },
      readFile: async () => {
        readFileCalled = true;
        return 'exceeds limit content string';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/test.log', maxBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(addNewFileCalled, false, 'addNewFile() must NOT be called after post-read limit rejection');
    assert.strictEqual(res.metadata.code, 'editor_file_too_large');
    assert.strictEqual(res.metadata.limit, 10);
    assert.strictEqual(res.metadata.size, 28);
  });

  it('allows file content exactly at maxBytes limit', async () => {
    const mockFs = (path) => ({
      stat: async () => ({ size: 10 }),
      readFile: async () => '1234567890'
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/test.log', maxBytes: 10 }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(addNewFileCalled, true);
    assert.strictEqual(res.data.opened, true);
  });

  it('handles multi-byte UTF-8 string encoding byte length limits', async () => {
    const mockFs = (path) => ({
      stat: async () => ({}),
      readFile: async () => 'éééééé' // 6 chars = 12 bytes UTF-8
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/test.txt', maxBytes: 10 }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(addNewFileCalled, false);
    assert.strictEqual(res.metadata.code, 'editor_file_too_large');
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
        action: 'editor:open_file',
        data: { path: '/test.log', maxBytes: invalid }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(addNewFileCalled, false);
      assert.ok(res.error.includes('Invalid maxBytes'));
    }
  });

  it('applies default limit (DEFAULT_EDITOR_MAX_BYTES 5MB) when maxBytes is omitted', async () => {
    let readFileCalled = false;
    const overDefaultLimit = DEFAULT_EDITOR_MAX_BYTES + 10;

    const mockFs = (path) => ({
      stat: async () => ({ size: overDefaultLimit }),
      readFile: async () => {
        readFileCalled = true;
        return 'huge content';
      }
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/large.log' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(readFileCalled, false);
    assert.strictEqual(addNewFileCalled, false);
    assert.strictEqual(res.metadata.code, 'editor_file_too_large');
    assert.strictEqual(res.metadata.limit, DEFAULT_EDITOR_MAX_BYTES);
    assert.strictEqual(res.metadata.size, overDefaultLimit);
  });

  it('opens normal small file when maxBytes is omitted', async () => {
    const mockFs = (path) => ({
      stat: async () => ({ size: 100 }),
      readFile: async () => 'small file content'
    });

    router.modules.fs = mockFs;
    router.setupCommands();

    const res = await router.route({
      action: 'editor:open_file',
      data: { path: '/small.txt' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(addNewFileCalled, true);
    assert.strictEqual(res.data.opened, true);
  });
});

const assert = require('assert');
const { MAX_PIPELINE_BYTES, PipelineRunner, IntentRouter } = require('../main.js');

describe('Acode PipelineRunner Size Guard Tests', () => {
  let mockRouter;

  function createMockRouter(fsMock) {
    return {
      requireFs: () => () => fsMock,
      log: () => {},
      route: async ({ action, data }) => ({ success: true, data })
    };
  }

  it('exports MAX_PIPELINE_BYTES with expected default value (5 MB)', () => {
    assert.strictEqual(MAX_PIPELINE_BYTES, 5 * 1024 * 1024);
  });

  it('1. rejects file before readFile() when stat().size exceeds limit', async () => {
    let readFileCalled = false;
    const fsMock = {
      stat: async () => ({ size: 1000 }),
      readFile: async () => {
        readFileCalled = true;
        return JSON.stringify({ steps: [] });
      }
    };

    const router = createMockRouter(fsMock);
    const runner = new PipelineRunner(router, { maxPipelineBytes: 500 });

    try {
      await runner.runPipelineFromFile('file:///test.intent.json');
      assert.fail('Should have thrown pipeline_too_large error');
    } catch (err) {
      assert.strictEqual(err.code, 'pipeline_too_large');
      assert.strictEqual(err.limit, 500);
      assert.strictEqual(err.size, 1000);
      assert.strictEqual(readFileCalled, false, 'readFile() must NOT be called when stat() exceeds limit');
    }
  });

  it('2. succeeds when stat().size is below limit with valid pipeline', async () => {
    let readFileCalled = false;
    const validPipeline = { steps: [{ intent: 'system.toast', payload: { message: 'hi' } }] };
    const jsonStr = JSON.stringify(validPipeline);

    const fsMock = {
      stat: async () => ({ size: jsonStr.length }),
      readFile: async () => {
        readFileCalled = true;
        return jsonStr;
      }
    };

    const router = createMockRouter(fsMock);
    const runner = new PipelineRunner(router, { maxPipelineBytes: 1000 });

    const result = await runner.runPipelineFromFile('file:///test.intent.json');
    assert.strictEqual(readFileCalled, true);
    assert.strictEqual(result.success, true);
  });

  it('3. rejects post-read before JSON.parse() when stat() is missing/unusable and content exceeds limit', async () => {
    const hugeContent = JSON.stringify({ steps: Array(100).fill({ intent: 'system.toast' }) });
    let parseAttempted = false;

    const fsMock = {
      // stat() without usable size
      stat: async () => ({}),
      readFile: async () => hugeContent
    };

    const router = createMockRouter(fsMock);
    // Setting limit smaller than hugeContent length
    const runner = new PipelineRunner(router, { maxPipelineBytes: 50 });

    try {
      await runner.runPipelineFromFile('file:///test.intent.json');
      assert.fail('Should have thrown pipeline_too_large error');
    } catch (err) {
      assert.strictEqual(err.code, 'pipeline_too_large');
      assert.strictEqual(err.limit, 50);
      assert.strictEqual(err.size, hugeContent.length);
    }
  });

  it('4. handles file EXACTLY at the limit deterministically (allowed)', async () => {
    const validPipeline = { steps: [] };
    const jsonStr = JSON.stringify(validPipeline); // e.g. '{"steps":[]}' -> 12 bytes
    const exactLimit = jsonStr.length;

    const fsMock = {
      stat: async () => ({ size: exactLimit }),
      readFile: async () => jsonStr
    };

    const router = createMockRouter(fsMock);
    const runner = new PipelineRunner(router, { maxPipelineBytes: exactLimit });

    const result = await runner.runPipelineFromFile('file:///test.intent.json');
    assert.strictEqual(result.success, true);
  });

  it('5. handles file 1 byte over the limit (rejected)', async () => {
    const validPipeline = { steps: [] };
    const jsonStr = JSON.stringify(validPipeline); // 12 bytes
    const limit = jsonStr.length - 1; // 11 bytes

    const fsMock = {
      stat: async () => ({ size: jsonStr.length }),
      readFile: async () => jsonStr
    };

    const router = createMockRouter(fsMock);
    const runner = new PipelineRunner(router, { maxPipelineBytes: limit });

    try {
      await runner.runPipelineFromFile('file:///test.intent.json');
      assert.fail('Should have thrown pipeline_too_large error');
    } catch (err) {
      assert.strictEqual(err.code, 'pipeline_too_large');
      assert.strictEqual(err.limit, limit);
      assert.strictEqual(err.size, jsonStr.length);
    }
  });

  it('6. retains unchanged SyntaxError for invalid JSON under limit', async () => {
    const invalidJson = '{ invalid json content...';
    const fsMock = {
      stat: async () => ({ size: invalidJson.length }),
      readFile: async () => invalidJson
    };

    const router = createMockRouter(fsMock);
    const runner = new PipelineRunner(router, { maxPipelineBytes: 1000 });

    try {
      await runner.runPipelineFromFile('file:///test.intent.json');
      assert.fail('Should have thrown SyntaxError');
    } catch (err) {
      assert.notStrictEqual(err.code, 'pipeline_too_large');
      assert(err instanceof SyntaxError || err.message.includes('JSON'), 'Should be a standard JSON parsing error');
    }
  });
});

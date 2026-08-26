const assert = require('assert');
const { validatePipelineStructure, PipelineRunner } = require('../main.js');

describe('validatePipelineStructure & PipelineRunner Fail-Fast Tests', () => {
  it('1. accepts a valid minimal pipeline', () => {
    const pipeline = {
      steps: [
        { intent: 'system.toast', payload: { message: 'hello' } }
      ]
    };
    const res = validatePipelineStructure(pipeline);
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.errors, []);
  });

  it('2. accepts valid pipeline with ids, continueOnError, and onFailure', () => {
    const pipeline = {
      steps: [
        { id: 'step-1', intent: 'file.read', payload: { path: '/a.txt' }, continueOnError: true, onFailure: 'step-2' },
        { id: 'step-2', intent: 'system.toast', payload: { message: 'done' } }
      ]
    };
    const res = validatePipelineStructure(pipeline);
    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.errors, []);
  });

  it('3. rejects non-object or null pipelineData', () => {
    assert.strictEqual(validatePipelineStructure(null).valid, false);
    assert.strictEqual(validatePipelineStructure(undefined).valid, false);
    assert.strictEqual(validatePipelineStructure('string').valid, false);
    assert.strictEqual(validatePipelineStructure(123).valid, false);
    assert.strictEqual(validatePipelineStructure([]).valid, false);
  });

  it('4. rejects pipeline when steps is missing or not an array', () => {
    assert.strictEqual(validatePipelineStructure({}).valid, false);
    assert.strictEqual(validatePipelineStructure({ steps: null }).valid, false);
    assert.strictEqual(validatePipelineStructure({ steps: 'not-an-array' }).valid, false);
    assert.strictEqual(validatePipelineStructure({ steps: { 0: {} } }).valid, false);
  });

  it('5. rejects invalid step elements (null, string, number, array)', () => {
    const pipeline = { steps: [null, 'step', 42, []] };
    const res = validatePipelineStructure(pipeline);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errors.length, 4);
    assert.ok(res.errors[0].includes('Step 1: must be a non-null object'));
  });

  it('6. rejects missing, non-string, or whitespace intent', () => {
    const p1 = { steps: [{ payload: {} }] };
    const p2 = { steps: [{ intent: 123 }] };
    const p3 = { steps: [{ intent: '   ' }] };

    assert.strictEqual(validatePipelineStructure(p1).valid, false);
    assert.strictEqual(validatePipelineStructure(p2).valid, false);
    assert.strictEqual(validatePipelineStructure(p3).valid, false);
  });

  it('7. rejects non-object or array payload when present', () => {
    const p1 = { steps: [{ intent: 'test', payload: 'string' }] };
    const p2 = { steps: [{ intent: 'test', payload: null }] };
    const p3 = { steps: [{ intent: 'test', payload: [1, 2] }] };

    assert.strictEqual(validatePipelineStructure(p1).valid, false);
    assert.strictEqual(validatePipelineStructure(p2).valid, false);
    assert.strictEqual(validatePipelineStructure(p3).valid, false);
  });

  it('8. rejects duplicate step ids', () => {
    const pipeline = {
      steps: [
        { id: 'dup', intent: 'test.one' },
        { id: 'dup', intent: 'test.two' }
      ]
    };
    const res = validatePipelineStructure(pipeline);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes("duplicate step id 'dup'")));
  });

  it('9. rejects non-boolean continueOnError', () => {
    const pipeline = { steps: [{ intent: 'test', continueOnError: 'true' }] };
    const res = validatePipelineStructure(pipeline);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('continueOnError must be a boolean')));
  });

  it('10. rejects empty/non-string onFailure or missing target id', () => {
    const p1 = { steps: [{ intent: 'test', onFailure: '  ' }] };
    const p2 = { steps: [{ intent: 'test', onFailure: 'non-existent-id' }] };

    assert.strictEqual(validatePipelineStructure(p1).valid, false);
    const res2 = validatePipelineStructure(p2);
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.errors.some(e => e.includes("onFailure target 'non-existent-id' not found in pipeline")));
  });

  it('11. PipelineRunner fail-fast: Step 1 valid + Step 2 invalid calls handler 0 times', async () => {
    let handlerCallCount = 0;
    const mockRouter = {
      route: async () => {
        handlerCallCount++;
        return { success: true };
      },
      log: () => {}
    };

    const runner = new PipelineRunner(mockRouter);
    const invalidPipeline = {
      steps: [
        { intent: 'system.toast', payload: { message: 'Step 1 side effect' } },
        { payload: { path: '/test' } } // Missing intent in step 2
      ]
    };

    try {
      await runner.runPipelineFromData(invalidPipeline);
      assert.fail('Should have thrown invalid_pipeline_structure error');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.ok(Array.isArray(err.errors));
      assert.strictEqual(handlerCallCount, 0, 'First step handler MUST be called 0 times for malformed pipeline');
    }
  });
});

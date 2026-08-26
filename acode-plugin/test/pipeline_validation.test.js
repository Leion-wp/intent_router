const assert = require('assert');
const { validatePipelineStructure, PipelineRunner } = require('../main.js');

describe('Acode Pipeline Runner Fail-Fast Structural Validation Tests', () => {
  function createMockRouter(routeImpl) {
    return {
      route: routeImpl || (async ({ action, data }) => ({ success: true, data })),
      log: () => {}
    };
  }

  it('1. accepts valid minimal and multi-step pipelines without throwing', () => {
    const validPipeline = {
      steps: [
        { id: 'step1', intent: 'system.toast', payload: { message: 'hello' } },
        { id: 'step2', intent: 'file.read', payload: { path: '/tmp/test.txt' }, continueOnError: true, onFailure: 'step1' }
      ]
    };
    assert.strictEqual(validatePipelineStructure(validPipeline), true);
  });

  it('2. rejects non-object pipelineData before step execution', () => {
    const invalidInputs = [null, undefined, 'string', 123, []];
    for (const input of invalidInputs) {
      try {
        validatePipelineStructure(input);
        assert.fail(`Should have rejected input: ${JSON.stringify(input)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'pipeline_not_an_object');
      }
    }
  });

  it('3. rejects missing or non-array steps property', () => {
    const invalidInputs = [{}, { steps: null }, { steps: 'not-an-array' }, { steps: 123 }];
    for (const input of invalidInputs) {
      try {
        validatePipelineStructure(input);
        assert.fail(`Should have rejected input: ${JSON.stringify(input)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'missing_steps_array');
      }
    }
  });

  it('4. rejects step elements equal to null, string, number, or array', () => {
    const invalidSteps = [
      { steps: [null] },
      { steps: ['invalid'] },
      { steps: [123] },
      { steps: [[{ intent: 'system.toast' }]] }
    ];
    for (const pipeline of invalidSteps) {
      try {
        validatePipelineStructure(pipeline);
        assert.fail(`Should have rejected pipeline: ${JSON.stringify(pipeline)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'invalid_step_element');
        assert.strictEqual(err.errors[0].stepIndex, 1);
      }
    }
  });

  it('5. rejects step with missing, non-string, or empty intent exposing index and step id', () => {
    const invalidSteps = [
      { steps: [{ id: 's1' }] },
      { steps: [{ id: 's2', intent: 123 }] },
      { steps: [{ id: 's3', intent: '   ' }] }
    ];
    for (const pipeline of invalidSteps) {
      try {
        validatePipelineStructure(pipeline);
        assert.fail(`Should have rejected pipeline: ${JSON.stringify(pipeline)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'invalid_step_intent');
        assert.strictEqual(err.errors[0].stepIndex, 1);
        assert.strictEqual(typeof err.errors[0].stepId, 'string');
      }
    }
  });

  it('6. rejects payload present but non-object (string, number, array, null)', () => {
    const invalidPayloads = [
      { steps: [{ intent: 'system.toast', payload: 'invalid-str' }] },
      { steps: [{ intent: 'system.toast', payload: 42 }] },
      { steps: [{ intent: 'system.toast', payload: null }] },
      { steps: [{ intent: 'system.toast', payload: ['array-not-allowed'] }] }
    ];
    for (const pipeline of invalidPayloads) {
      try {
        validatePipelineStructure(pipeline);
        assert.fail(`Should have rejected payload: ${JSON.stringify(pipeline)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'invalid_step_payload');
        assert.strictEqual(err.errors[0].stepIndex, 1);
      }
    }
  });

  it('7. rejects duplicate explicit step IDs or invalid step ID types', () => {
    // Duplicate step IDs
    const duplicateIdPipeline = {
      steps: [
        { id: 'my-step', intent: 'system.toast' },
        { id: 'my-step', intent: 'file.read' }
      ]
    };
    try {
      validatePipelineStructure(duplicateIdPipeline);
      assert.fail('Should have rejected duplicate step IDs');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'duplicate_step_id');
      assert.strictEqual(err.errors[0].stepId, 'my-step');
      assert.strictEqual(err.errors[0].stepIndex, 2);
    }

    // Invalid step ID format (non-string or empty)
    const invalidIdPipeline = { steps: [{ id: '', intent: 'system.toast' }] };
    try {
      validatePipelineStructure(invalidIdPipeline);
      assert.fail('Should have rejected empty step ID');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'invalid_step_id');
    }
  });

  it('8. rejects non-boolean continueOnError', () => {
    const invalidPipeline = {
      steps: [
        { intent: 'system.toast', continueOnError: 'true' }
      ]
    };
    try {
      validatePipelineStructure(invalidPipeline);
      assert.fail('Should have rejected non-boolean continueOnError');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'invalid_continue_on_error');
    }
  });

  it('9. rejects empty or non-string onFailure target', () => {
    const invalidPipelines = [
      { steps: [{ intent: 'system.toast', onFailure: '' }] },
      { steps: [{ intent: 'system.toast', onFailure: 123 }] }
    ];
    for (const pipeline of invalidPipelines) {
      try {
        validatePipelineStructure(pipeline);
        assert.fail('Should have rejected invalid onFailure target type');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors[0].code, 'invalid_on_failure_target');
      }
    }
  });

  it('10. rejects onFailure referencing a non-existent step ID', () => {
    const invalidPipeline = {
      steps: [
        { id: 'step1', intent: 'system.toast', onFailure: 'non-existent-step' }
      ]
    };
    try {
      validatePipelineStructure(invalidPipeline);
      assert.fail('Should have rejected missing onFailure target');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'missing_on_failure_target');
      assert.strictEqual(err.errors[0].stepIndex, 1);
      assert.strictEqual(err.errors[0].stepId, 'step1');
    }
  });

  it('11. guarantees step 1 handler is called EXACTLY ZERO times when step 2 is malformed', async () => {
    let step1Calls = 0;
    const router = createMockRouter(async ({ action, data }) => {
      step1Calls++;
      return { success: true, data };
    });
    const runner = new PipelineRunner(router);

    const invalidPipeline = {
      steps: [
        { id: 'valid-step-1', intent: 'system.toast', payload: { message: 'first step side effect' } },
        { id: 'invalid-step-2', intent: '' } // malformed intent
      ]
    };

    try {
      await runner.runPipelineFromData(invalidPipeline);
      assert.fail('Should have rejected pipeline before execution');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(step1Calls, 0, 'First step handler MUST be called exactly zero times');
    }
  });

  it('12. preserves deterministic error order when multiple structural errors exist', () => {
    const multiErrorPipeline = {
      steps: [
        { intent: 123 }, // invalid_step_intent
        { intent: 'system.toast', payload: 'bad-payload' } // invalid_step_payload
      ]
    };
    try {
      validatePipelineStructure(multiErrorPipeline);
      assert.fail('Should have rejected multi-error pipeline');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 2);
      assert.strictEqual(err.errors[0].code, 'invalid_step_intent');
      assert.strictEqual(err.errors[0].stepIndex, 1);
      assert.strictEqual(err.errors[1].code, 'invalid_step_payload');
      assert.strictEqual(err.errors[1].stepIndex, 2);
    }
  });
});

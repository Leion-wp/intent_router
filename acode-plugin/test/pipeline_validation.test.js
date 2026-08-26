const assert = require('assert');
const { validatePipelineStructure, PipelineRunner } = require('../main.js');

describe('Acode Pipeline Runner Structural Validation Tests', () => {
  function createMockRouter(routeImpl) {
    return {
      route: routeImpl || (async ({ action, data }) => ({ success: true, data })),
      log: () => {}
    };
  }

  it('1. accepts valid minimal pipeline structure without throwing', () => {
    const validPipeline = {
      steps: [
        {
          id: 'step1',
          intent: 'system.toast',
          payload: { message: 'hello' },
          continueOnError: false,
          onFailure: 'step2'
        },
        {
          id: 'step2',
          intent: 'file.read',
          payload: { path: '/tmp/test.txt' }
        }
      ]
    };

    assert.strictEqual(validatePipelineStructure(validPipeline), true);
  });

  it('2. rejects non-object or null pipelineData', () => {
    const invalidInputs = [null, undefined, 'not-an-object', 123, true, []];

    for (const input of invalidInputs) {
      try {
        validatePipelineStructure(input);
        assert.fail(`Should have rejected pipelineData: ${JSON.stringify(input)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.ok(Array.isArray(err.errors));
        assert.strictEqual(err.errors[0].code, 'invalid_pipeline_object');
      }
    }
  });

  it('3. rejects missing, non-array, or null steps property', () => {
    const invalidPipelines = [
      {},
      { steps: null },
      { steps: 'not-an-array' },
      { steps: 123 },
      { steps: {} }
    ];

    for (const pipeline of invalidPipelines) {
      try {
        validatePipelineStructure(pipeline);
        assert.fail(`Should have rejected steps: ${JSON.stringify(pipeline)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.ok(Array.isArray(err.errors));
        assert.strictEqual(err.errors[0].code, 'invalid_steps_array');
      }
    }
  });

  it('4. rejects non-object step items (null, string, number, array)', () => {
    const pipeline = {
      steps: [
        { intent: 'step.one' },
        null,
        'step-string',
        123,
        ['nested-array']
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected non-object step items');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 4);
      assert.strictEqual(err.errors[0].stepIndex, 2);
      assert.strictEqual(err.errors[0].code, 'invalid_step_type');
    }
  });

  it('5. rejects missing, non-string, or empty/whitespace intents with stepIndex and stepId', () => {
    const pipeline = {
      steps: [
        { id: 'first', intent: '' },
        { id: 'second', intent: '   ' },
        { intent: 123 },
        {}
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected invalid intents');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 4);
      assert.strictEqual(err.errors[0].stepIndex, 1);
      assert.strictEqual(err.errors[0].stepId, 'first');
      assert.strictEqual(err.errors[0].code, 'invalid_step_intent');

      assert.strictEqual(err.errors[1].stepIndex, 2);
      assert.strictEqual(err.errors[1].stepId, 'second');

      assert.strictEqual(err.errors[2].stepIndex, 3);
      assert.strictEqual(err.errors[2].stepId, undefined);
    }
  });

  it('6. rejects non-object or array/null payload', () => {
    const pipeline = {
      steps: [
        { intent: 'step.a', payload: 'string-payload' },
        { intent: 'step.b', payload: [1, 2, 3] },
        { intent: 'step.c', payload: 42 }
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected invalid payloads');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 3);
      assert.strictEqual(err.errors[0].code, 'invalid_step_payload');
    }
  });

  it('7. rejects duplicate explicit step ids and invalid id types', () => {
    const pipeline = {
      steps: [
        { id: 'dup-id', intent: 'step.1' },
        { id: 'dup-id', intent: 'step.2' },
        { id: '  ', intent: 'step.3' },
        { id: 123, intent: 'step.4' }
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected duplicate and invalid step ids');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      const codes = err.errors.map(e => e.code);
      assert.ok(codes.includes('duplicate_step_id'));
      assert.ok(codes.includes('invalid_step_id'));
    }
  });

  it('8. rejects continueOnError when present but non-boolean', () => {
    const pipeline = {
      steps: [
        { intent: 'step.1', continueOnError: 'true' },
        { intent: 'step.2', continueOnError: 1 }
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected non-boolean continueOnError');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 2);
      assert.strictEqual(err.errors[0].code, 'invalid_continue_on_error');
    }
  });

  it('9. rejects invalid or non-existent onFailure references before execution', () => {
    const pipeline = {
      steps: [
        { id: 'stepA', intent: 'step.1', onFailure: '' },
        { id: 'stepB', intent: 'step.2', onFailure: 'nonExistentStep' }
      ]
    };

    try {
      validatePipelineStructure(pipeline);
      assert.fail('Should have rejected invalid and unknown onFailure targets');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      const codes = err.errors.map(e => e.code);
      assert.ok(codes.includes('invalid_on_failure'));
      assert.ok(codes.includes('unknown_on_failure_target'));
    }
  });

  it('10. Fail-fast side-effect guard: step 1 handler called ZERO times if step 2 is invalid', async () => {
    let step1CallCount = 0;
    const router = createMockRouter(async () => {
      step1CallCount++;
      return { success: true };
    });

    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { id: 'step1', intent: 'file.write', payload: { path: '/tmp/test.txt', content: 'hello' } },
        { id: 'step2' } // missing intent
      ]
    };

    try {
      await runner.runPipelineFromData(pipelineData);
      assert.fail('Should have failed validation prior to step execution');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(step1CallCount, 0, 'Step 1 handler must be called exactly 0 times');
    }
  });
});

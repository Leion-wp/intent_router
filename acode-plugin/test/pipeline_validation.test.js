const assert = require('assert');
const { PipelineRunner, validatePipelineStructure } = require('../main.js');

describe('Acode Pipeline Structure Validation Tests', () => {
  let mockRouter;
  let routedActions;

  beforeEach(() => {
    routedActions = [];
    mockRouter = {
      log: () => {},
      route: async ({ action, data }) => {
        routedActions.push({ action, data });
        return { success: true, data };
      }
    };
  });

  it('1. accepts valid pipeline and runs normally', async () => {
    const validPipeline = {
      steps: [
        { id: 'step-1', intent: 'system.toast', payload: { message: 'hello' } },
        { id: 'step-2', intent: 'file.read', payload: { path: '/tmp/test' }, continueOnError: true, onFailure: 'step-1' }
      ]
    };

    assert.doesNotThrow(() => validatePipelineStructure(validPipeline));

    const runner = new PipelineRunner(mockRouter);
    const res = await runner.runPipelineFromData(validPipeline);
    assert.strictEqual(res.success, true);
    assert.strictEqual(routedActions.length, 2);
  });

  it('2. rejects null, string, array, non-object pipelineData', async () => {
    const invalidInputs = [null, 'string', 123, true, []];

    for (const input of invalidInputs) {
      try {
        await new PipelineRunner(mockRouter).runPipelineFromData(input);
        assert.fail(`Should have thrown for pipelineData: ${JSON.stringify(input)}`);
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(routedActions.length, 0);
      }
    }
  });

  it('3. rejects missing or non-array steps', async () => {
    const invalidPipelines = [
      {},
      { steps: null },
      { steps: 'not-an-array' },
      { steps: 123 }
    ];

    for (const pipeline of invalidPipelines) {
      try {
        await new PipelineRunner(mockRouter).runPipelineFromData(pipeline);
        assert.fail('Should have thrown for non-array steps');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(routedActions.length, 0);
      }
    }
  });

  it('4. rejects non-object step elements (null, string, number, array)', async () => {
    const pipeline = {
      steps: [
        { intent: 'system.toast' },
        null,
        'step-string',
        42,
        ['step-array']
      ]
    };

    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipeline);
      assert.fail('Should have thrown for invalid step element types');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 4);
      assert.strictEqual(err.errors[0].code, 'invalid_step_type');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('5. rejects step with missing, numeric, or whitespace-only intent', async () => {
    const pipeline = {
      steps: [
        { id: 's1' }, // missing intent
        { id: 's2', intent: 123 }, // non-string
        { id: 's3', intent: '   ' } // whitespace-only
      ]
    };

    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipeline);
      assert.fail('Should have thrown for invalid intent');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 3);
      assert.strictEqual(err.errors[0].code, 'invalid_step_intent');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('6. rejects step with payload that is explicit null, string, number, or array', async () => {
    const pipeline = {
      steps: [
        { intent: 'system.toast', payload: null },
        { intent: 'system.toast', payload: 'string-payload' },
        { intent: 'system.toast', payload: ['array-payload'] }
      ]
    };

    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipeline);
      assert.fail('Should have thrown for invalid payload');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 3);
      assert.strictEqual(err.errors[0].code, 'invalid_step_payload');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('7. rejects empty or duplicate step ids', async () => {
    const pipelineEmptyId = {
      steps: [
        { id: '  ', intent: 'system.toast' }
      ]
    };
    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipelineEmptyId);
      assert.fail('Should have thrown for empty id');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'invalid_step_id');
      assert.strictEqual(routedActions.length, 0);
    }

    const pipelineDuplicateId = {
      steps: [
        { id: 'step-a', intent: 'system.toast' },
        { id: 'step-a', intent: 'file.read' }
      ]
    };
    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipelineDuplicateId);
      assert.fail('Should have thrown for duplicate id');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'duplicate_step_id');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('8. rejects non-boolean continueOnError', async () => {
    const pipeline = {
      steps: [
        { intent: 'system.toast', continueOnError: 'true' },
        { intent: 'system.toast', continueOnError: 1 }
      ]
    };

    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipeline);
      assert.fail('Should have thrown for non-boolean continueOnError');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 2);
      assert.strictEqual(err.errors[0].code, 'invalid_continue_on_error');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('9. rejects empty or non-string onFailure and unresolved target ids', async () => {
    const pipelineBadOnFailureType = {
      steps: [
        { intent: 'system.toast', onFailure: 123 },
        { intent: 'system.toast', onFailure: '' }
      ]
    };
    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipelineBadOnFailureType);
      assert.fail('Should have thrown for bad onFailure type');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors.length, 2);
      assert.strictEqual(err.errors[0].code, 'invalid_on_failure');
      assert.strictEqual(routedActions.length, 0);
    }

    const pipelineUnresolvedOnFailure = {
      steps: [
        { id: 's1', intent: 'system.toast', onFailure: 'non-existent-step' }
      ]
    };
    try {
      await new PipelineRunner(mockRouter).runPipelineFromData(pipelineUnresolvedOnFailure);
      assert.fail('Should have thrown for unresolved onFailure target');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(err.errors[0].code, 'unresolved_on_failure_target');
      assert.strictEqual(routedActions.length, 0);
    }
  });

  it('10. side-effect prevention: step 1 is NEVER invoked if step 2 is invalid', async () => {
    let sideEffectCount = 0;
    const router = {
      log: () => {},
      route: async ({ action, data }) => {
        sideEffectCount++;
        return { success: true, data };
      }
    };

    const runner = new PipelineRunner(router);
    const corruptedPipeline = {
      steps: [
        { id: 'step-1', intent: 'file.write', payload: { path: '/tmp/important.txt', content: 'deleted' } },
        { id: 'step-2', intent: '' } // Corrupted / invalid step 2
      ]
    };

    try {
      await runner.runPipelineFromData(corruptedPipeline);
      assert.fail('Should have thrown validation error before executing step 1');
    } catch (err) {
      assert.strictEqual(err.code, 'invalid_pipeline_structure');
      assert.strictEqual(sideEffectCount, 0, 'Step 1 mock handler must be called EXACTLY zero times');
    }
  });
});

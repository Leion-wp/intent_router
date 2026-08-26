const assert = require('assert');
const { validatePipelineStructure, PipelineRunner } = require('../main.js');

describe('Acode Pipeline Structural Validation Tests', () => {
  function createMockRouter(routeImpl) {
    let callCount = 0;
    const calls = [];
    const router = {
      route: async (params) => {
        callCount++;
        calls.push(params);
        if (routeImpl) {
          return routeImpl(params);
        }
        return { success: true, data: { status: 'ok' } };
      },
      log: () => {},
      getCallCount: () => callCount,
      getCalls: () => calls,
    };
    return router;
  }

  describe('validatePipelineStructure helper function', () => {
    it('accepts a minimal valid pipeline', () => {
      const pipeline = { steps: [] };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('accepts a valid pipeline with full metadata and cross-references', () => {
      const pipeline = {
        steps: [
          {
            id: 'step1',
            intent: 'system.toast',
            payload: { message: 'hello' },
            continueOnError: true,
            onFailure: 'step2'
          },
          {
            id: 'step2',
            intent: 'file.read',
            payload: { path: '/tmp/test.txt' }
          }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('rejects top-level pipeline data when null, primitive, or array', () => {
      const invalidInputs = [null, undefined, 123, 'not object', true, [1, 2, 3]];
      for (const input of invalidInputs) {
        const res = validatePipelineStructure(input);
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.errors.length, 1);
        assert.strictEqual(res.errors[0].code, 'invalid_pipeline_structure');
      }
    });

    it('rejects missing or non-array steps property', () => {
      const invalidPipelines = [{}, { steps: null }, { steps: 'not array' }, { steps: 123 }];
      for (const pipeline of invalidPipelines) {
        const res = validatePipelineStructure(pipeline);
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.errors.length, 1);
        assert.strictEqual(res.errors[0].code, 'invalid_pipeline_structure');
      }
    });

    it('rejects non-object elements in steps array', () => {
      const pipeline = { steps: [null, 'string_step', 42, [1, 2]] };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 4);
      assert.strictEqual(res.errors[0].code, 'invalid_step_type');
      assert.strictEqual(res.errors[0].index, 0);
      assert.strictEqual(res.errors[1].code, 'invalid_step_type');
      assert.strictEqual(res.errors[1].index, 1);
    });

    it('rejects missing, non-string, or empty/whitespace intent', () => {
      const pipeline = {
        steps: [
          { payload: {} },
          { intent: 123 },
          { intent: '' },
          { intent: '   ' }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 4);
      for (let i = 0; i < 4; i++) {
        assert.strictEqual(res.errors[i].code, 'invalid_intent');
        assert.strictEqual(res.errors[i].index, i);
      }
    });

    it('rejects payload when present but non-object, array, or null', () => {
      const pipeline = {
        steps: [
          { intent: 'step.one', payload: 'string_payload' },
          { intent: 'step.two', payload: 123 },
          { intent: 'step.three', payload: true },
          { intent: 'step.four', payload: null },
          { intent: 'step.five', payload: ['array_payload'] }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 5);
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(res.errors[i].code, 'invalid_payload');
        assert.strictEqual(res.errors[i].index, i);
      }
    });

    it('allows omitted payload property', () => {
      const pipeline = { steps: [{ intent: 'system.toast' }] };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, true);
    });

    it('rejects invalid or empty step id and duplicate step ids', () => {
      const pipeline = {
        steps: [
          { id: '', intent: 'step.one' },
          { id: 123, intent: 'step.two' },
          { id: 'dup_id', intent: 'step.three' },
          { id: 'dup_id', intent: 'step.four' }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors[0].code, 'invalid_id');
      assert.strictEqual(res.errors[0].index, 0);
      assert.strictEqual(res.errors[1].code, 'invalid_id');
      assert.strictEqual(res.errors[1].index, 1);
      assert.strictEqual(res.errors[2].code, 'duplicate_step_id');
      assert.strictEqual(res.errors[2].index, 3);
      assert.strictEqual(res.errors[2].stepId, 'dup_id');
    });

    it('rejects non-boolean continueOnError property', () => {
      const pipeline = {
        steps: [
          { intent: 'step.one', continueOnError: 'true' },
          { intent: 'step.two', continueOnError: 1 }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 2);
      assert.strictEqual(res.errors[0].code, 'invalid_continue_on_error');
      assert.strictEqual(res.errors[1].code, 'invalid_continue_on_error');
    });

    it('rejects non-string or empty onFailure property', () => {
      const pipeline = {
        steps: [
          { intent: 'step.one', onFailure: '' },
          { intent: 'step.two', onFailure: 123 }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 2);
      assert.strictEqual(res.errors[0].code, 'invalid_on_failure');
      assert.strictEqual(res.errors[1].code, 'invalid_on_failure');
    });

    it('rejects onFailure referencing a non-existent step id', () => {
      const pipeline = {
        steps: [
          { id: 'step1', intent: 'step.one', onFailure: 'missing_step' }
        ]
      };
      const res = validatePipelineStructure(pipeline);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 1);
      assert.strictEqual(res.errors[0].code, 'unknown_on_failure_target');
      assert.strictEqual(res.errors[0].index, 0);
      assert.strictEqual(res.errors[0].stepId, 'step1');
      assert.strictEqual(res.errors[0].targetId, 'missing_step');
    });
  });

  describe('PipelineRunner fail-fast enforcement', () => {
    it('executes valid pipeline steps normally', async () => {
      const router = createMockRouter();
      const runner = new PipelineRunner(router);
      const pipeline = {
        steps: [
          { intent: 'system.toast', payload: { message: 'hi' } },
          { intent: 'file.read', payload: { path: '/tmp/file.txt' } }
        ]
      };

      const result = await runner.runPipelineFromData(pipeline);
      assert.strictEqual(result.success, true);
      assert.strictEqual(router.getCallCount(), 2);
    });

    it('FAIL-FAST: step 1 handler is called EXACTLY ZERO times when step 2 is invalid', async () => {
      const router = createMockRouter();
      const runner = new PipelineRunner(router);
      const pipeline = {
        steps: [
          { id: 'step1', intent: 'file.write', payload: { path: '/tmp/dest.txt', content: 'data' } },
          { id: 'step2', intent: '' } // step 2 invalid: empty intent
        ]
      };

      try {
        await runner.runPipelineFromData(pipeline);
        assert.fail('Should have thrown invalid_pipeline_structure error');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.ok(Array.isArray(err.errors));
        assert.strictEqual(router.getCallCount(), 0, 'Step 1 handler must NOT be called when step 2 is invalid!');
      }
    });

    it('FAIL-FAST: rejects unresolvable onFailure target before executing any step', async () => {
      const router = createMockRouter();
      const runner = new PipelineRunner(router);
      const pipeline = {
        steps: [
          { id: 'step1', intent: 'network.request', payload: { url: 'https://example.com' }, onFailure: 'unknown_target' }
        ]
      };

      try {
        await runner.runPipelineFromData(pipeline);
        assert.fail('Should have thrown invalid_pipeline_structure error');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(router.getCallCount(), 0, 'No step must be routed when onFailure target is unknown');
      }
    });
  });
});

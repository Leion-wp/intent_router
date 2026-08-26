const assert = require('assert');
const { validatePipelineStructure, PipelineRunner } = require('../main.js');

describe('Acode Fail-Fast Pipeline Structure Validation Tests', () => {
  function createMockRouter(routeImpl) {
    let callCount = 0;
    return {
      callCount: () => callCount,
      route: async (params) => {
        callCount++;
        return routeImpl ? routeImpl(params) : { success: true, data: {} };
      },
      log: () => {}
    };
  }

  describe('validatePipelineStructure helper unit tests', () => {
    it('1. accepts a valid minimal pipeline', () => {
      const validPipeline = {
        steps: [
          { intent: 'system.toast', payload: { message: 'hello' } }
        ]
      };
      assert.strictEqual(validatePipelineStructure(validPipeline), true);
    });

    it('2. accepts pipeline with step ids, payloads, continueOnError, and valid onFailure targets', () => {
      const validPipeline = {
        steps: [
          { id: 'step-1', intent: 'file.read', payload: { path: '/a.txt' }, continueOnError: false, onFailure: 'step-2' },
          { id: 'step-2', intent: 'system.toast', payload: { message: 'failed' }, continueOnError: true }
        ]
      };
      assert.strictEqual(validatePipelineStructure(validPipeline), true);
    });

    it('3. rejects top-level pipelineData when null, primitive, or array', () => {
      const invalidCases = [null, undefined, 'string', 123, true, [1, 2, 3]];
      for (const invalidInput of invalidCases) {
        try {
          validatePipelineStructure(invalidInput);
          assert.fail(`Should have thrown for invalid top-level input: ${JSON.stringify(invalidInput)}`);
        } catch (err) {
          assert.strictEqual(err.code, 'invalid_pipeline_structure');
          assert.ok(Array.isArray(err.errors));
          assert.strictEqual(err.errors[0].message, 'pipelineData must be a non-null object');
        }
      }
    });

    it('4. rejects pipeline with missing or non-array steps property', () => {
      const invalidCases = [{}, { steps: null }, { steps: 'not array' }, { steps: 123 }, { steps: {} }];
      for (const invalidPipeline of invalidCases) {
        try {
          validatePipelineStructure(invalidPipeline);
          assert.fail(`Should have thrown for invalid steps property: ${JSON.stringify(invalidPipeline)}`);
        } catch (err) {
          assert.strictEqual(err.code, 'invalid_pipeline_structure');
          assert.ok(Array.isArray(err.errors));
          assert.strictEqual(err.errors[0].message, 'steps array is missing or not an array');
        }
      }
    });

    it('5. rejects steps containing null, string, number, or array elements', () => {
      const invalidPipeline = {
        steps: [
          null,
          'not object',
          123,
          [{ intent: 'file.read' }]
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for non-object step elements');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 4);
        assert.strictEqual(err.errors[0].index, 1);
        assert.strictEqual(err.errors[1].index, 2);
        assert.strictEqual(err.errors[2].index, 3);
        assert.strictEqual(err.errors[3].index, 4);
      }
    });

    it('6. rejects step with missing, non-string, or whitespace-only intent', () => {
      const invalidPipeline = {
        steps: [
          { payload: {} },
          { intent: 123 },
          { intent: '' },
          { intent: '   ' }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for invalid intent');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 4);
        assert.ok(err.errors.every(e => e.message.includes('intent must be a non-empty string')));
      }
    });

    it('7. rejects present payload when null, primitive, or array', () => {
      const invalidPipeline = {
        steps: [
          { intent: 'file.read', payload: null },
          { intent: 'file.write', payload: 'string payload' },
          { intent: 'file.delete', payload: 123 },
          { intent: 'file.list', payload: ['array', 'payload'] }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for invalid payload');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 4);
        assert.ok(err.errors.every(e => e.message.includes('payload must be a non-null object')));
      }
    });

    it('8. rejects duplicate explicit step ids across steps', () => {
      const invalidPipeline = {
        steps: [
          { id: 'step-a', intent: 'file.read' },
          { id: 'step-b', intent: 'file.write' },
          { id: 'step-a', intent: 'file.delete' }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for duplicate step id');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 1);
        assert.strictEqual(err.errors[0].index, 3);
        assert.strictEqual(err.errors[0].id, 'step-a');
        assert.ok(err.errors[0].message.includes("Duplicate step id 'step-a'"));
      }
    });

    it('9. rejects invalid id type or empty string id when present', () => {
      const invalidPipeline = {
        steps: [
          { id: '', intent: 'file.read' },
          { id: '   ', intent: 'file.write' },
          { id: 123, intent: 'file.delete' }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for invalid id');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 3);
        assert.ok(err.errors.every(e => e.message.includes('id must be a non-empty string')));
      }
    });

    it('10. rejects continueOnError when present and not a boolean', () => {
      const invalidPipeline = {
        steps: [
          { intent: 'file.read', continueOnError: 'true' },
          { intent: 'file.write', continueOnError: 1 },
          { intent: 'file.delete', continueOnError: null }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for non-boolean continueOnError');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 3);
        assert.ok(err.errors.every(e => e.message.includes('continueOnError must be a boolean')));
      }
    });

    it('11. rejects onFailure when empty, whitespace, or non-string', () => {
      const invalidPipeline = {
        steps: [
          { intent: 'file.read', onFailure: '' },
          { intent: 'file.write', onFailure: '   ' },
          { intent: 'file.delete', onFailure: 123 }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for invalid onFailure format');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 3);
        assert.ok(err.errors.every(e => e.message.includes('onFailure must be a non-empty string')));
      }
    });

    it('12. rejects onFailure targeting a non-existent step id', () => {
      const invalidPipeline = {
        steps: [
          { id: 'step-1', intent: 'file.read', onFailure: 'step-missing' },
          { id: 'step-2', intent: 'system.toast' }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for unknown onFailure target step id');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 1);
        assert.strictEqual(err.errors[0].index, 1);
        assert.strictEqual(err.errors[0].id, 'step-1');
        assert.ok(err.errors[0].message.includes("onFailure targets unknown step id 'step-missing'"));
      }
    });

    it('13. maintains deterministic ordering of diagnostic messages for multiple structural errors', () => {
      const invalidPipeline = {
        steps: [
          { intent: 'step.one', payload: 'invalid payload' },
          { intent: '' },
          { intent: 'step.three', id: 's3', onFailure: 'missing-id' }
        ]
      };
      try {
        validatePipelineStructure(invalidPipeline);
        assert.fail('Should have thrown for multiple errors');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(err.errors.length, 3);
        assert.strictEqual(err.errors[0].index, 1);
        assert.strictEqual(err.errors[1].index, 2);
        assert.strictEqual(err.errors[2].index, 3);
      }
    });
  });

  describe('PipelineRunner side-effect isolation and fail-fast tests', () => {
    it('14. calling runPipelineFromData with valid step 1 and invalid step 2 executes router handler 0 times', async () => {
      const router = createMockRouter(async () => {
        return { success: true };
      });
      const runner = new PipelineRunner(router);

      const invalidPipeline = {
        steps: [
          { intent: 'file.write', payload: { path: '/destructive/file.txt', content: 'data' } },
          { intent: '' } // Invalid step 2: missing intent
        ]
      };

      try {
        await runner.runPipelineFromData(invalidPipeline);
        assert.fail('Should have thrown invalid_pipeline_structure');
      } catch (err) {
        assert.strictEqual(err.code, 'invalid_pipeline_structure');
        assert.strictEqual(router.callCount(), 0, 'Router handler MUST NOT be called for any step when pipeline structure is invalid');
      }
    });

    it('15. calling runPipelineFromData with a valid multi-step pipeline executes successfully', async () => {
      const router = createMockRouter(async ({ action, data }) => {
        return { success: true, data: { action, data } };
      });
      const runner = new PipelineRunner(router);

      const validPipeline = {
        steps: [
          { intent: 'file.read', payload: { path: '/a.txt' } },
          { intent: 'file.write', payload: { path: '/b.txt', content: 'hello' } }
        ]
      };

      const result = await runner.runPipelineFromData(validPipeline);
      assert.strictEqual(result.success, true);
      assert.strictEqual(router.callCount(), 2);
      assert.strictEqual(result.logs.length, 2);
    });
  });
});

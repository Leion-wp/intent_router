const assert = require('assert');
const { PipelineRunner, resolveRunVariables, captureStepOutputs } = require('../main.js');

describe('Acode Pipeline Run-Scoped Output Variables Tests', () => {
  function createMockRouter(handlers) {
    const routedCalls = [];
    return {
      routedCalls,
      route: async ({ action, data }, variableCache) => {
        routedCalls.push({ action, data });
        if (handlers && handlers[action]) {
          return handlers[action](data, variableCache);
        }
        return { success: true, data: { status: 'ok', echoed: data } };
      },
      log: () => {}
    };
  }

  it('1. step A mock returns { content: "hello" } with outputVar: "answer", step B receives "hello" via ${var:answer}', async () => {
    const router = createMockRouter({
      'ai:generate': async () => ({
        success: true,
        data: { content: 'hello' }
      }),
      'file:write': async (data) => ({
        success: true,
        data: { written: true, path: data.path, content: data.content }
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'ai.generate',
          payload: { prompt: 'say hello', outputVar: 'answer' }
        },
        {
          intent: 'file.write',
          payload: { path: '/tmp/output.txt', content: '${var:answer}' }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.routedCalls.length, 2);
    assert.strictEqual(router.routedCalls[1].data.content, 'hello');
  });

  it('2. primitive result capture and reuse via outputVar', async () => {
    const router = createMockRouter({
      'math:double': async (data) => ({
        success: true,
        data: data.num * 2
      }),
      'system:toast': async (data) => ({
        success: true,
        data: { toastShown: data.message }
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'math.double',
          payload: { num: 21, outputVar: 'doubled' }
        },
        {
          intent: 'system.toast',
          payload: { message: 'Result is ${var:doubled}' }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.routedCalls[1].data.message, 'Result is 42');
  });

  it('3. outputVarPath captures result.path and outputVarChanges captures result.changes as deterministic JSON', async () => {
    const router = createMockRouter({
      'file:create': async () => ({
        success: true,
        data: {
          content: 'some text',
          path: '/project/src/index.js',
          changes: { added: 1, file: 'index.js', lines: [10, 20] }
        }
      }),
      'summary:record': async (data) => ({
        success: true,
        data
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'file.create',
          payload: {
            outputVar: 'out_content',
            outputVarPath: 'out_path',
            outputVarChanges: 'out_changes'
          }
        },
        {
          intent: 'summary.record',
          payload: {
            p: '${var:out_path}',
            c: '${var:out_changes}',
            text: '${var:out_content}'
          }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.routedCalls[1].data.p, '/project/src/index.js');
    assert.strictEqual(router.routedCalls[1].data.text, 'some text');
    assert.strictEqual(
      router.routedCalls[1].data.c,
      '{"added":1,"file":"index.js","lines":[10,20]}'
    );
  });

  it('4. recursive resolution in nested objects and arrays', async () => {
    const router = createMockRouter({
      'producer:get': async () => ({
        success: true,
        data: 'value1'
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'producer.get',
          payload: { outputVar: 'val1' }
        },
        {
          intent: 'consumer.post',
          payload: {
            nested: {
              arr: ['item1', '${var:val1}'],
              obj: { inner: 'prefix_${var:val1}_suffix' }
            }
          }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(router.routedCalls[1].data, {
      nested: {
        arr: ['item1', 'value1'],
        obj: { inner: 'prefix_value1_suffix' }
      }
    });
  });

  it('5. missing variable fails step before handler invocation with code pipeline_variable_missing', async () => {
    let handlerCalled = false;
    const router = createMockRouter({
      'step:consumer': async () => {
        handlerCalled = true;
        return { success: true };
      }
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'step.consumer',
          payload: { input: '${var:non_existent_var}' }
        }
      ]
    };

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineData);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(handlerCalled, false, 'Step handler should NOT be executed when a variable is missing');
    assert.ok(caughtError.message.includes('Pipeline variable missing: non_existent_var'));
  });

  it('6. failed producer step does not publish a fake outputVar from partial/failed result', async () => {
    const router = createMockRouter({
      'producer:fail': async () => ({
        success: false,
        error: 'Failed execution',
        data: { content: 'should_not_be_captured' }
      }),
      'consumer:check': async (data) => ({
        success: true,
        data
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'producer.fail',
          payload: { outputVar: 'answer' },
          continueOnError: true
        },
        {
          intent: 'consumer.check',
          payload: { value: '${var:answer}' }
        }
      ]
    };

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineData);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Step 2 should fail because outputVar was not captured on failed step 1');
    assert.strictEqual(router.routedCalls.length, 1, 'Consumer step should not have been called');
  });

  it('7. run isolation: variable created in run A is never visible in run B', async () => {
    const router = createMockRouter();
    const runner = new PipelineRunner(router);

    const pipelineA = {
      steps: [
        {
          intent: 'step.produce',
          payload: { outputVar: 'shared_key' }
        }
      ]
    };
    const pipelineB = {
      steps: [
        {
          intent: 'step.consume',
          payload: { input: '${var:shared_key}' }
        }
      ]
    };

    const resA = await runner.runPipelineFromData(pipelineA);
    assert.strictEqual(resA.success, true);

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineB);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Run B should fail due to missing variable despite Run A having set it');
    assert.ok(caughtError.message.includes('Pipeline variable missing: shared_key'));
  });

  it('8. value containing ${var:...} characters is not recursively re-resolved', async () => {
    const router = createMockRouter({
      'producer:get': async () => ({
        success: true,
        data: { content: '${var:other}' }
      }),
      'consumer:use': async (data) => ({
        success: true,
        data
      })
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'producer.get',
          payload: { outputVar: 'nested_template' }
        },
        {
          intent: 'consumer.use',
          payload: { text: '${var:nested_template}' }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.routedCalls[1].data.text, '${var:other}');
  });

  it('9. legacy pipeline without outputVar or ${var:...} preserves exact existing behavior', async () => {
    const router = createMockRouter();
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'system.toast', payload: { message: 'hello world' } },
        { intent: 'file.read', payload: { path: '/tmp/test.txt' } }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.logs.length, 2);
    assert.deepStrictEqual(router.routedCalls[0].data, { message: 'hello world' });
    assert.deepStrictEqual(router.routedCalls[1].data, { path: '/tmp/test.txt' });
  });

  it('10. resolveRunVariables unit test for direct helper calls', () => {
    const cache = new Map();
    cache.set('name', 'World');
    cache.set('count', '5');

    assert.strictEqual(resolveRunVariables('Hello ${var:name}!', cache), 'Hello World!');
    assert.deepStrictEqual(
      resolveRunVariables({ a: '${var:name}', b: [1, '${var:count}'] }, cache),
      { a: 'World', b: [1, '5'] }
    );

    assert.throws(
      () => resolveRunVariables('${var:unknown}', cache),
      (err) => err.code === 'pipeline_variable_missing' && err.variableName === 'unknown'
    );
  });

  it('11. captureStepOutputs unit test for object and primitive results', () => {
    const cache = new Map();
    const stepObj = { payload: { outputVar: 'vContent', outputVarPath: 'vPath', outputVarChanges: 'vChanges' } };
    captureStepOutputs(stepObj, { content: 'hello', path: '/a/b.js', changes: { ok: true } }, cache);

    assert.strictEqual(cache.get('vContent'), 'hello');
    assert.strictEqual(cache.get('vPath'), '/a/b.js');
    assert.strictEqual(cache.get('vChanges'), '{"ok":true}');

    const cachePrim = new Map();
    const stepPrim = { payload: { outputVar: 'vResult' } };
    captureStepOutputs(stepPrim, 'primitive_output', cachePrim);
    assert.strictEqual(cachePrim.get('vResult'), 'primitive_output');
  });
});

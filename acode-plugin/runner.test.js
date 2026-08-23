const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function getPipelineRunnerClass() {
  const code = fs.readFileSync(__dirname + '/main.js', 'utf8');
  // Append export statement inside IIFE or assign to global inside sandbox
  const modifiedCode = code.replace(
    'class PipelineRunner {',
    'globalThis.PipelineRunner = class PipelineRunner {'
  );

  const sandbox = {
    globalThis: {},
    window: {},
    console: console,
    navigator: { userAgent: '', platform: '' },
    document: { createElement: () => ({ style: {} }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(modifiedCode, sandbox);
  return sandbox.globalThis.PipelineRunner;
}

async function runTests() {
  console.log('Running PipelineRunner unit tests...');

  const PipelineRunner = getPipelineRunnerClass();
  assert.ok(PipelineRunner, 'PipelineRunner class should be extracted');

  // Mock router helper
  function createMockRouter(routeImpl) {
    return {
      route: routeImpl,
      log: () => {},
    };
  }

  // 1. Step with router.route() returning success: false
  {
    let routeCalledWith = null;
    const router = createMockRouter(async (params) => {
      routeCalledWith = params;
      return { success: false, error: 'Route error message', data: { detail: 'err_info' } };
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'file.read', payload: { path: '/test.txt' } }
      ]
    };

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineData);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Should throw pipeline abort error');
    assert.strictEqual(caughtError.message, 'Pipeline aborted at step 1 (file.read): Route error message');
    assert.strictEqual(routeCalledWith.action, 'file:read', 'Dot should be converted to colon');
    assert.deepStrictEqual(routeCalledWith.data, { path: '/test.txt' });
  }

  // 2. Step with router.route() throwing an Exception
  {
    const router = createMockRouter(async () => {
      throw new Error('Unexpected throw in router');
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'action.fail', payload: {} }
      ]
    };

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineData);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Should throw pipeline abort error');
    assert.strictEqual(caughtError.message, 'Pipeline aborted at step 1 (action.fail): Unexpected throw in router');
  }

  // 3. Successful step execution
  {
    const router = createMockRouter(async () => {
      return { success: true, data: { status: 'ok' } };
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'system.toast', payload: { message: 'hello' } }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.logs.length, 1, 'Should contain exactly 1 log entry for 1 step');
    assert.strictEqual(res.logs[0].step, 1);
    assert.strictEqual(res.logs[0].intent, 'system.toast');
    assert.strictEqual(res.logs[0].success, true);
    assert.deepStrictEqual(res.logs[0].data, { status: 'ok' });
  }

  // 4. continueOnError: true followed by successful step
  {
    let callCount = 0;
    const router = createMockRouter(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, error: 'First step soft error', data: null };
      }
      return { success: true, data: 'Second step success' };
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'step.one', payload: {}, continueOnError: true },
        { intent: 'step.two', payload: {} }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.logs.length, 2, 'Should contain exactly 2 log entries (one per executed step)');
    assert.strictEqual(res.logs[0].success, false);
    assert.strictEqual(res.logs[0].error, 'First step soft error');
    assert.strictEqual(res.logs[1].success, true);
    assert.strictEqual(res.logs[1].data, 'Second step success');
  }

  // 5. continueOnError: false aborts at step 1 and does not execute step 2
  {
    let callCount = 0;
    const router = createMockRouter(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, error: 'Hard failure' };
      }
      return { success: true };
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        { intent: 'step.one', payload: {}, continueOnError: false },
        { intent: 'step.two', payload: {} }
      ]
    };

    let caughtError = null;
    try {
      await runner.runPipelineFromData(pipelineData);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(callCount, 1, 'Step 2 should not be executed');
    assert.strictEqual(caughtError.message, 'Pipeline aborted at step 1 (step.one): Hard failure');
  }

  // 6. Step retry policy handles transient failure
  {
    let callCount = 0;
    const router = createMockRouter(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: false, error: 'Temporary network glitch' };
      }
      return { success: true, data: 'Fetched data on retry' };
    });
    const runner = new PipelineRunner(router);
    const pipelineData = {
      steps: [
        {
          intent: 'network.request',
          payload: {
            retry: { mode: 'fixed', maxAttempts: 3, delayMs: 0 }
          }
        }
      ]
    };

    const res = await runner.runPipelineFromData(pipelineData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(callCount, 2, 'Should retry and succeed on attempt 2');
    assert.strictEqual(res.logs[0].attempt, 2);
    assert.strictEqual(res.logs[0].maxAttempts, 3);
  }

  console.log('All PipelineRunner tests loaded.');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

import * as assert from 'assert';
import * as path from 'path';

const { PipelineRunner, IntentRouter } = require(path.resolve(__dirname, '../../acode-plugin/main.js'));

suite('Acode PipelineRunner (Mocked)', () => {
  let router: any;
  let runner: any;
  let executedSteps: string[];

  setup(() => {
    executedSteps = [];
    router = new IntentRouter();

    router.register('test:success', async (data: any, intent: any) => {
      executedSteps.push(intent?.id || 'success_step');
      return { ok: true };
    });

    router.register('test:fail', async (data: any, intent: any) => {
      executedSteps.push(intent?.id || 'fail_step');
      throw new Error('Step intentional failure');
    });

    router.register('terminal:run', async (data: any, intent: any) => {
      executedSteps.push(intent?.id || 'terminal_step');
      if (data?.command === 'false') {
        throw new Error('Command failed');
      }
      return { output: 'done' };
    });

    runner = new PipelineRunner(router);
  });

  test('runs sequential pipeline successfully when all steps pass', async () => {
    const pipeline = {
      name: 'sequential-success',
      steps: [
        { id: 'node_1', intent: 'test.success' },
        { id: 'node_2', intent: 'test.success' }
      ]
    };

    const result = await runner.runPipelineFromData(pipeline);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(executedSteps, ['node_1', 'node_2']);
  });

  test('jumps to onFailure target step when step fails', async () => {
    const pipeline = {
      name: 'on-failure-branching',
      steps: [
        { id: 'node_1', intent: 'test.fail', onFailure: 'node_3' },
        { id: 'node_2', intent: 'test.success' },
        { id: 'node_3', intent: 'test.success' }
      ]
    };

    const progressLogs: any[] = [];
    const result = await runner.runPipelineFromData(pipeline, (p: any) => progressLogs.push(p));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(executedSteps, ['node_1', 'node_3']);
    assert.strictEqual(progressLogs.some(p => p.status === 'success'), true);
  });

  test('aborts self-loop onFailure step with bounded execution limit error', async () => {
    const pipeline = {
      name: 'self-loop-failure',
      steps: [
        { id: 'retry', intent: 'terminal.run', payload: { command: 'false' }, onFailure: 'retry' }
      ]
    };

    let caughtError: any = null;
    let result: any = null;
    try {
      result = await runner.runPipelineFromData(pipeline, null, { maxExecutionLimit: 5 });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Expected runPipelineFromData to throw an execution limit error');
    assert.ok(
      caughtError.message.includes('Pipeline execution limit reached') || caughtError.message.includes('Cycle or infinite loop detected'),
      `Error message should state execution limit reached or cycle detected, got: ${caughtError.message}`
    );
    assert.ok(
      caughtError.message.includes('id: retry') || caughtError.message.includes('retry'),
      `Error message should contain step id, got: ${caughtError.message}`
    );
    assert.ok(
      caughtError.message.includes('5 steps executed'),
      `Error message should contain execution count, got: ${caughtError.message}`
    );
    assert.strictEqual(executedSteps.length, 5);
  });

  test('aborts multi-step cycle A -> B -> A with bounded execution error and bounded logs', async () => {
    const pipeline = {
      name: 'multi-step-cycle',
      steps: [
        { id: 'step_A', intent: 'test.fail', onFailure: 'step_B' },
        { id: 'step_B', intent: 'test.fail', onFailure: 'step_A' }
      ]
    };

    let caughtError: any = null;
    try {
      await runner.runPipelineFromData(pipeline, null, { maxExecutionLimit: 6 });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Expected multi-step cycle to throw an execution limit error');
    assert.ok(
      caughtError.message.includes('Pipeline execution limit reached'),
      `Expected execution limit error message, got: ${caughtError.message}`
    );
    assert.ok(
      caughtError.message.includes('6 steps executed'),
      `Expected 6 steps executed in message, got: ${caughtError.message}`
    );
    assert.strictEqual(executedSteps.length, 6);
    assert.deepStrictEqual(executedSteps, ['step_A', 'step_B', 'step_A', 'step_B', 'step_A', 'step_B']);
  });

  test('aborts with explicit error when onFailure target step ID is invalid/absent', async () => {
    const pipeline = {
      name: 'on-failure-invalid-target',
      steps: [
        { id: 'node_1', intent: 'test.fail', onFailure: 'non_existent_node' },
        { id: 'node_2', intent: 'test.success' }
      ]
    };

    let caughtError: any = null;
    try {
      await runner.runPipelineFromData(pipeline);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Expected runPipelineFromData to throw an error');
    assert.ok(
      caughtError.message.includes('Invalid onFailure target step ID: non_existent_node'),
      `Error message should mention invalid target step ID, got: ${caughtError.message}`
    );
    assert.deepStrictEqual(executedSteps, ['node_1']);
  });

  test('continues to next step when continueOnError is true', async () => {
    const pipeline = {
      name: 'continue-on-error',
      steps: [
        { id: 'node_1', intent: 'test.fail', continueOnError: true },
        { id: 'node_2', intent: 'test.success' }
      ]
    };

    const result = await runner.runPipelineFromData(pipeline);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(executedSteps, ['node_1', 'node_2']);
  });

  test('aborts pipeline when step fails with no onFailure or continueOnError', async () => {
    const pipeline = {
      name: 'unhandled-failure',
      steps: [
        { id: 'node_1', intent: 'test.fail' },
        { id: 'node_2', intent: 'test.success' }
      ]
    };

    await assert.rejects(
      async () => {
        await runner.runPipelineFromData(pipeline);
      },
      (err: any) => {
        return err.message.includes('Pipeline aborted at step 1');
      }
    );
    assert.deepStrictEqual(executedSteps, ['node_1']);
  });
});

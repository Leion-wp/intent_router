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

    // Register test commands
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
      if (data?.command === 'npm install') {
        throw new Error('npm install failed');
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

  test('respects onFailure in install .vsix pipeline regression structure', async () => {
    const pipeline = {
      name: 'install .vsix',
      steps: [
        {
          id: 'node_1',
          intent: 'terminal.run',
          payload: { command: 'npm install' },
          onFailure: 'node_3'
        },
        {
          id: 'node_3',
          intent: 'terminal.run',
          payload: { command: 'npm run compile' }
        },
        {
          id: 'node_5',
          intent: 'terminal.run',
          payload: { command: 'vsce package' }
        }
      ]
    };

    const result = await runner.runPipelineFromData(pipeline);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(executedSteps, ['node_1', 'node_3', 'node_5']);
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

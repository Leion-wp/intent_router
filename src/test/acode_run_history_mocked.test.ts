import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { IntentRouter } = require('../../acode-plugin/main');

function createMockFs(tempDir: string) {
  return function (targetPath: string) {
    let cleanPath = targetPath;
    if (cleanPath.startsWith('file://')) {
      cleanPath = cleanPath.replace(/^file:\/\//, '');
    }

    return {
      exists: async () => {
        return fs.existsSync(cleanPath);
      },
      readFile: async (encoding?: string) => {
        if (!fs.existsSync(cleanPath)) {
          throw new Error(`File not found: ${cleanPath}`);
        }
        return fs.readFileSync(cleanPath, (encoding || 'utf-8') as BufferEncoding);
      },
      writeFile: async (content: string) => {
        const parent = path.dirname(cleanPath);
        if (!fs.existsSync(parent)) {
          fs.mkdirSync(parent, { recursive: true });
        }
        fs.writeFileSync(cleanPath, content, 'utf-8');
      },
      createDirectory: async (dirName: string) => {
        const full = path.join(cleanPath, dirName);
        if (!fs.existsSync(full)) {
          fs.mkdirSync(full, { recursive: true });
        }
        return full;
      },
      delete: async () => {
        if (fs.existsSync(cleanPath)) {
          fs.rmSync(cleanPath, { recursive: true, force: true });
        }
      }
    };
  };
}

suite('Acode Plugin Run History Store (Mocked)', () => {
  let tempDir: string;
  let router: any;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acode-history-test-'));
    router = new IntentRouter();
    router.modules.fs = createMockFs(tempDir);
    router.setupCommands();
    router.runHistoryStore.projectRootOverride = tempDir;
  });

  teardown(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('records successful pipeline run with 2 steps', async () => {
    const pipelineData = {
      name: 'Test Success Pipeline',
      steps: [
        { intent: 'system.toast', payload: { message: 'step 1' } },
        { intent: 'system.toast', payload: { message: 'step 2' } }
      ]
    };

    const pipelinePath = path.join(tempDir, 'pipeline', 'test.intent.json');
    const mockFs = createMockFs(tempDir)(pipelinePath);
    await mockFs.writeFile(JSON.stringify(pipelineData));

    const result = await router.pipelineRunner.runPipelineFromFile(pipelinePath);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.logs.length, 2);

    const historyResponse = await router.route({ action: 'router:run_history' });
    assert.strictEqual(historyResponse.success, true);
    const runs = historyResponse.data;
    assert.strictEqual(runs.length, 1);

    const run = runs[0];
    assert.strictEqual(run.status, 'success');
    assert.strictEqual(run.pipelineName, 'Test Success Pipeline');
    assert.strictEqual(run.stepCount, 2);
    assert.strictEqual(run.completedSteps, 2);
    assert.strictEqual(run.failedStep, null);
    assert.strictEqual(run.error, null);
    assert.strictEqual(run.logs.length, 2);
  });

  test('records run failure mid-pipeline and captures failedStep', async () => {
    // Register a failing command for step 2
    router.register('fail:cmd', () => {
      throw new Error('Simulated failure at step 2');
    });

    const pipelineData = {
      name: 'Failing Pipeline',
      steps: [
        { intent: 'system.toast', payload: { message: 'step 1 ok' } },
        { intent: 'fail.cmd', payload: {} },
        { intent: 'system.toast', payload: { message: 'step 3 skipped' } }
      ]
    };

    const pipelinePath = path.join(tempDir, 'pipeline', 'fail.intent.json');
    const mockFs = createMockFs(tempDir)(pipelinePath);
    await mockFs.writeFile(JSON.stringify(pipelineData));

    let threw = false;
    try {
      await router.pipelineRunner.runPipelineFromFile(pipelinePath);
    } catch (err: any) {
      threw = true;
      assert.ok(err.message.includes('Simulated failure at step 2'));
    }
    assert.strictEqual(threw, true);

    const history = await router.runHistoryStore.loadRuns();
    assert.strictEqual(history.length, 1);
    const run = history[0];

    assert.strictEqual(run.status, 'error');
    assert.strictEqual(run.pipelineName, 'Failing Pipeline');
    assert.strictEqual(run.stepCount, 3);
    assert.strictEqual(run.completedSteps, 1);
    assert.strictEqual(run.failedStep, 2);
    assert.ok(run.error.includes('Simulated failure at step 2'));
    assert.strictEqual(run.logs.length, 2);
  });

  test('records failure before step 1 when file read or parse fails', async () => {
    const invalidPath = path.join(tempDir, 'nonexistent.intent.json');

    let threw = false;
    try {
      await router.pipelineRunner.runPipelineFromFile(invalidPath);
    } catch (err: any) {
      threw = true;
    }
    assert.strictEqual(threw, true);

    const history = await router.runHistoryStore.loadRuns();
    assert.strictEqual(history.length, 1);
    const run = history[0];

    assert.strictEqual(run.status, 'error');
    assert.strictEqual(run.stepCount, 0);
    assert.strictEqual(run.completedSteps, 0);
    assert.strictEqual(run.failedStep, null);
    assert.ok(run.error.includes('File not found'));
  });

  test('persists history in .intent-router/runs.json and reloads on new router instance', async () => {
    await router.runHistoryStore.addRun({
      runId: 'run_1',
      pipelineName: 'Run 1',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'success',
      durationMs: 100,
      stepCount: 1,
      completedSteps: 1,
      failedStep: null,
      error: null,
      logs: []
    });

    // Create a brand new router instance with same workspace path
    const newRouter = new IntentRouter();
    newRouter.modules.fs = createMockFs(tempDir);
    newRouter.setupCommands();
    newRouter.runHistoryStore.projectRootOverride = tempDir;

    const runs = await newRouter.runHistoryStore.loadRuns();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].runId, 'run_1');
    assert.strictEqual(runs[0].pipelineName, 'Run 1');
  });

  test('enforces retention limit (maxRuns = 50) and keeps newest first', async () => {
    for (let i = 1; i <= 60; i++) {
      await router.runHistoryStore.addRun({
        runId: `run_${i}`,
        pipelineName: `Pipeline Run ${i}`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'success',
        durationMs: 50,
        stepCount: 1,
        completedSteps: 1,
        failedStep: null,
        error: null,
        logs: []
      });
    }

    const runs = await router.runHistoryStore.loadRuns();
    assert.strictEqual(runs.length, 50);
    // Newest run should be first (run_60)
    assert.strictEqual(runs[0].runId, 'run_60');
    // Oldest preserved run should be run_11
    assert.strictEqual(runs[49].runId, 'run_11');
  });

  test('clears history via router:clear_run_history', async () => {
    await router.runHistoryStore.addRun({
      runId: 'run_temp',
      pipelineName: 'Temp Pipeline',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'success',
      durationMs: 10,
      stepCount: 1,
      completedSteps: 1,
      failedStep: null,
      error: null,
      logs: []
    });

    let runs = await router.runHistoryStore.loadRuns();
    assert.strictEqual(runs.length, 1);

    const clearRes = await router.route({ action: 'router:clear_run_history' });
    assert.strictEqual(clearRes.success, true);

    runs = await router.runHistoryStore.loadRuns();
    assert.strictEqual(runs.length, 0);

    // Verify .intent-router/runs.json is deleted
    const runsFilePath = path.join(tempDir, '.intent-router', 'runs.json');
    assert.strictEqual(fs.existsSync(runsFilePath), false);
  });
});

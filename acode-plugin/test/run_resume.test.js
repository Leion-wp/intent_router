const assert = require('assert');
const {
  IntentRouter,
  PipelineRunner,
  RunHistoryStore,
  computePipelineSignature
} = require('../main.js');

describe('Acode Pipeline Run Checkpoint & Resume Tests', () => {
  let router;
  let executedSteps;
  let mockFiles;

  function createMockFs() {
    return (path) => ({
      stat: async () => ({ size: (mockFiles[path] || '').length }),
      readFile: async () => {
        if (!(path in mockFiles)) {
          const err = new Error(`File not found: ${path}`);
          err.code = 'ENOENT';
          throw err;
        }
        return mockFiles[path];
      },
      writeFile: async (content) => {
        mockFiles[path] = content;
      },
      exists: async () => path in mockFiles
    });
  }

  beforeEach(() => {
    executedSteps = [];
    mockFiles = {};

    router = new IntentRouter();
    router.modules.fs = createMockFs();
    router.setupCommands();

    router.register('test:step_one', async (data) => {
      executedSteps.push({ step: 1, data });
      return { ok: true, step: 1 };
    });

    router.register('test:step_two', async (data) => {
      executedSteps.push({ step: 2, data });
      return { ok: true, step: 2 };
    });

    router.register('test:step_three', async (data) => {
      executedSteps.push({ step: 3, data });
      if (data && data.shouldFail) {
        throw new Error('Step 3 forced failure');
      }
      return { ok: true, step: 3 };
    });
  });

  it('1. computePipelineSignature computes deterministic signature', () => {
    const pipeline1 = {
      name: 'Build Pipeline',
      steps: [
        { intent: 'test.step_one', payload: { a: 1 } },
        { intent: 'test.step_two', payload: { b: 2 } }
      ]
    };

    const pipeline2 = {
      name: 'Build Pipeline',
      steps: [
        { intent: 'test.step_one', payload: { a: 1 } },
        { intent: 'test.step_two', payload: { b: 2 } }
      ]
    };

    const pipelineModified = {
      name: 'Build Pipeline',
      steps: [
        { intent: 'test.step_one', payload: { a: 1 } },
        { intent: 'test.step_two', payload: { b: 999 } }
      ]
    };

    const sig1 = computePipelineSignature(pipeline1);
    const sig2 = computePipelineSignature(pipeline2);
    const sigMod = computePipelineSignature(pipelineModified);

    assert.strictEqual(sig1, sig2, 'Identical pipelines must produce identical signatures');
    assert.notStrictEqual(sig1, sigMod, 'Modified pipeline must produce a different signature');
    assert.ok(sig1.startsWith('sig_'));
  });

  it('2. 3-step pipeline: steps 1-2 succeed, step 3 fails -> checkpoint created at step 2', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/3step.intent.json';
    const pipelineData = {
      name: '3-step test',
      steps: [
        { id: 's1', intent: 'test.step_one', payload: { value: 10 } },
        { id: 's2', intent: 'test.step_two', payload: { value: 20 } },
        { id: 's3', intent: 'test.step_three', payload: { shouldFail: true } }
      ]
    };
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    let thrown = false;
    try {
      await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_orig_1' });
    } catch (err) {
      thrown = true;
      assert.ok(err.message.includes('Step 3 forced failure'));
    }
    assert.strictEqual(thrown, true);

    assert.strictEqual(executedSteps.length, 3);
    assert.strictEqual(executedSteps[0].step, 1);
    assert.strictEqual(executedSteps[1].step, 2);
    assert.strictEqual(executedSteps[2].step, 3);

    const history = router.historyStore.getHistory();
    assert.strictEqual(history.length, 1);
    const parentRun = history[0];
    assert.strictEqual(parentRun.id, 'run_orig_1');
    assert.strictEqual(parentRun.status, 'failure');
    assert.ok(parentRun.checkpoint, 'Checkpoint should exist');
    assert.strictEqual(parentRun.checkpoint.lastCompletedStepIndex, 1, 'Index 1 is step 2');
    assert.strictEqual(parentRun.checkpoint.lastCompletedStepId, 's2');
    assert.strictEqual(parentRun.checkpoint.completedStepsCount, 2);
  });

  it('3. Resume executes only remaining step 3 without re-running steps 1 and 2', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/3step.intent.json';
    const pipelineData = {
      name: '3-step test',
      steps: [
        { id: 's1', intent: 'test.step_one', payload: { value: 10 } },
        { id: 's2', intent: 'test.step_two', payload: { value: 20 } },
        { id: 's3', intent: 'test.step_three', payload: { shouldFail: true } }
      ]
    };
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    try {
      await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_orig_2' });
    } catch (_) {}

    // Fix step 3 in file so resume can succeed
    pipelineData.steps[2].payload.shouldFail = false;
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    // Mismatch signature expected if we update file without update checkpoint, but wait:
    // If file content changed, resume should be rejected!
    // So let's test resume rejection when file content changed first:
    const changeCheckResult = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_orig_2' }
    });

    assert.strictEqual(changeCheckResult.success, false);
    assert.strictEqual(changeCheckResult.metadata.code, 'resume_pipeline_changed');

    // Reset file to original content but make step 3 pass dynamically via handler behavior
    mockFiles[pipelineUrl] = JSON.stringify({
      name: '3-step test',
      steps: [
        { id: 's1', intent: 'test.step_one', payload: { value: 10 } },
        { id: 's2', intent: 'test.step_two', payload: { value: 20 } },
        { id: 's3', intent: 'test.step_three', payload: { shouldFail: true } }
      ]
    });

    // Re-register step 3 handler to succeed instead of fail
    router.register('test:step_three', async (data) => {
      executedSteps.push({ step: 3, data, resumed: true });
      return { ok: true, step: 3 };
    });

    executedSteps = [];

    const resumeRes = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_orig_2' }
    });

    assert.strictEqual(resumeRes.success, true);
    assert.strictEqual(executedSteps.length, 1, 'Only step 3 should have been executed');
    assert.strictEqual(executedSteps[0].step, 3);
    assert.strictEqual(executedSteps[0].resumed, true);

    const history = router.historyStore.getHistory();
    assert.strictEqual(history.length, 2, 'History must contain both original run and resumed run');

    const resumedRun = history[0];
    const origRun = history[1];

    assert.strictEqual(origRun.id, 'run_orig_2');
    assert.strictEqual(origRun.status, 'failure');

    assert.strictEqual(resumedRun.parentRunId, 'run_orig_2');
    assert.strictEqual(resumedRun.source, 'resume');
    assert.strictEqual(resumedRun.status, 'success');
    assert.notStrictEqual(resumedRun.id, origRun.id);
  });

  it('4. Rejects resume if .intent.json has changed since checkpoint (resume_pipeline_changed)', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/change.intent.json';
    const pipelineData = {
      name: 'Original',
      steps: [
        { id: 's1', intent: 'test.step_one', payload: {} },
        { id: 's2', intent: 'test.step_three', payload: { shouldFail: true } }
      ]
    };
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    try {
      await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_change_1' });
    } catch (_) {}

    // Modify file
    pipelineData.steps.push({ id: 's3', intent: 'test.step_two', payload: {} });
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    const res = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_change_1' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'resume_pipeline_changed');
    assert.ok(res.error.includes('Pipeline content changed since checkpoint'));
  });

  it('5. Rejects resume if first step failed (0 steps completed -> resume_invalid_checkpoint)', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/fail_first.intent.json';
    const pipelineData = {
      name: 'Fail First',
      steps: [
        { id: 's1', intent: 'test.step_three', payload: { shouldFail: true } },
        { id: 's2', intent: 'test.step_two', payload: {} }
      ]
    };
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    try {
      await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_fail_first' });
    } catch (_) {}

    const res = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_fail_first' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'resume_invalid_checkpoint');
  });

  it('6. Rejects resume for a fully successful run (resume_not_eligible)', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/success.intent.json';
    const pipelineData = {
      name: 'All Success',
      steps: [
        { id: 's1', intent: 'test.step_one', payload: {} },
        { id: 's2', intent: 'test.step_two', payload: {} }
      ]
    };
    mockFiles[pipelineUrl] = JSON.stringify(pipelineData);

    await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_success' });

    const res = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_success' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'resume_not_eligible');
    assert.ok(res.error.includes('already completed successfully'));
  });

  it('7. Rejects resume for non-existent runId (resume_run_not_found)', async () => {
    const res = await router.route({
      action: 'router:resume_run',
      data: { runId: 'run_ghost' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.metadata.code, 'resume_run_not_found');
  });

  it('8. router:run_history returns history and supports filtering by runId', async () => {
    const pipelineUrl = 'file:///workspace/pipeline/hist.intent.json';
    mockFiles[pipelineUrl] = JSON.stringify({
      steps: [{ intent: 'test.step_one', payload: {} }]
    });

    await router.pipelineRunner.runPipelineFromFile(pipelineUrl, null, { runId: 'run_h1' });

    const allHist = await router.route({ action: 'router:run_history' });
    assert.strictEqual(allHist.success, true);
    assert.strictEqual(allHist.data.length, 1);
    assert.strictEqual(allHist.data[0].id, 'run_h1');

    const singleRun = await router.route({
      action: 'router:run_history',
      data: { runId: 'run_h1' }
    });
    assert.strictEqual(singleRun.success, true);
    assert.strictEqual(singleRun.data.id, 'run_h1');
  });
});

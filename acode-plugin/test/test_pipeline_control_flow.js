const assert = require('assert');
const { createAcodeEnvironment } = require('./harness');

async function testPipelineControlFlow() {
  const env = createAcodeEnvironment();
  const { router } = env;

  try {
    let step1Ran = false;
    let step2Ran = false;

    router.register('test:step1', () => {
      step1Ran = true;
      return { ok: true };
    });

    router.register('test:fail', () => {
      throw new Error('Simulated step failure');
    });

    router.register('test:step2', () => {
      step2Ran = true;
      return { ok: true };
    });

    // Case 1: continueOnError = false (default) -> should abort pipeline on failure
    const pipelineAbort = {
      steps: [
        { intent: 'test.step1' },
        { intent: 'test.fail', continueOnError: false },
        { intent: 'test.step2' }
      ]
    };

    let errorThrown = false;
    try {
      await router.pipelineRunner.runPipelineFromData(pipelineAbort);
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('Simulated step failure'));
    }

    assert.strictEqual(errorThrown, true, 'Pipeline should throw an error on step failure when continueOnError is false');
    assert.strictEqual(step1Ran, true, 'Step 1 should have run');
    assert.strictEqual(step2Ran, false, 'Step 2 should NOT have run after step failure');

    // Case 2: continueOnError = true -> should record error and continue
    const env2 = createAcodeEnvironment();
    const router2 = env2.router;
    let step1Ran2 = false;
    let step2Ran2 = false;

    router2.register('test:step1', () => { step1Ran2 = true; return { ok: true }; });
    router2.register('test:fail', () => { throw new Error('Simulated step failure'); });
    router2.register('test:step2', () => { step2Ran2 = true; return { ok: true }; });

    const pipelineContinue = {
      steps: [
        { intent: 'test.step1' },
        { intent: 'test.fail', continueOnError: true },
        { intent: 'test.step2' }
      ]
    };

    const res = await router2.pipelineRunner.runPipelineFromData(pipelineContinue);
    assert.strictEqual(res.success, true);
    assert.strictEqual(step1Ran2, true);
    assert.strictEqual(step2Ran2, true, 'Step 2 SHOULD run when continueOnError is true');
    assert.strictEqual(res.logs.length, 3, 'Logs should record exactly 3 steps without duplicate log entries');
    assert.strictEqual(res.logs[1].success, false);
    await env2.destroy();

  } finally {
    await env.destroy();
  }
}

module.exports = testPipelineControlFlow;

const assert = require('assert');
const {
  PipelineRunner,
  IntentRouter,
  resolveRetryPolicy,
  computeRetryDelayMs,
  normalizeRetryMode
} = require('../main.js');

describe('Acode PipelineRunner Step Retry and Backoff Tests', () => {
  describe('Retry Policy Parsing & Normalization', () => {
    it('normalizes retry modes correctly', () => {
      assert.strictEqual(normalizeRetryMode('fixed'), 'fixed');
      assert.strictEqual(normalizeRetryMode('FIXED'), 'fixed');
      assert.strictEqual(normalizeRetryMode('simple'), 'fixed');
      assert.strictEqual(normalizeRetryMode('exponential'), 'exponential');
      assert.strictEqual(normalizeRetryMode('EXPONENTIAL'), 'exponential');
      assert.strictEqual(normalizeRetryMode('none'), 'none');
      assert.strictEqual(normalizeRetryMode('invalid'), 'none');
      assert.strictEqual(normalizeRetryMode(null), 'none');
      assert.strictEqual(normalizeRetryMode(undefined), 'none');
    });

    it('resolves default policy when no retry config is specified', () => {
      const policy = resolveRetryPolicy({ intent: 'system.toast' });
      assert.deepStrictEqual(policy, {
        mode: 'none',
        maxAttempts: 1,
        delayMs: 1000,
        maxDelayMs: 30000,
        jitterMs: 0
      });
    });

    it('reads policy from step.retry or step.payload.retry', () => {
      const step1 = {
        intent: 'network.request',
        retry: { mode: 'fixed', maxAttempts: 3, delayMs: 500 }
      };
      const policy1 = resolveRetryPolicy(step1);
      assert.strictEqual(policy1.mode, 'fixed');
      assert.strictEqual(policy1.maxAttempts, 3);
      assert.strictEqual(policy1.delayMs, 500);

      const step2 = {
        intent: 'network.request',
        payload: {
          retry: { mode: 'exponential', maxAttempts: 4, delayMs: 200, maxDelayMs: 5000, jitterMs: 50 }
        }
      };
      const policy2 = resolveRetryPolicy(step2);
      assert.strictEqual(policy2.mode, 'exponential');
      assert.strictEqual(policy2.maxAttempts, 4);
      assert.strictEqual(policy2.delayMs, 200);
      assert.strictEqual(policy2.maxDelayMs, 5000);
      assert.strictEqual(policy2.jitterMs, 50);
    });

    it('clamps maxAttempts between 1 and 10', () => {
      const stepExcessive = { retry: { mode: 'fixed', maxAttempts: 99 } };
      assert.strictEqual(resolveRetryPolicy(stepExcessive).maxAttempts, 10);

      const stepZero = { retry: { mode: 'fixed', maxAttempts: 0 } };
      assert.strictEqual(resolveRetryPolicy(stepZero).maxAttempts, 1);

      const stepNegative = { retry: { mode: 'fixed', maxAttempts: -5 } };
      assert.strictEqual(resolveRetryPolicy(stepNegative).maxAttempts, 1);

      const stepNoneMode = { retry: { mode: 'none', maxAttempts: 5 } };
      assert.strictEqual(resolveRetryPolicy(stepNoneMode).maxAttempts, 1);
    });

    it('handles invalid or negative delay/jitter values safely', () => {
      const stepInvalid = {
        retry: {
          mode: 'fixed',
          delayMs: -100,
          maxDelayMs: 'invalid',
          jitterMs: -50
        }
      };
      const policy = resolveRetryPolicy(stepInvalid);
      assert.strictEqual(policy.delayMs, 0);
      assert.strictEqual(policy.maxDelayMs, 30000);
      assert.strictEqual(policy.jitterMs, 0);
    });
  });

  describe('Delay Calculation and Backoff', () => {
    it('returns 0 delay for mode none', () => {
      const policy = { mode: 'none', maxAttempts: 1, delayMs: 1000, maxDelayMs: 30000, jitterMs: 100 };
      assert.strictEqual(computeRetryDelayMs(policy, 1), 0);
    });

    it('computes fixed delay accurately', () => {
      const policy = { mode: 'fixed', maxAttempts: 3, delayMs: 500, maxDelayMs: 5000, jitterMs: 0 };
      assert.strictEqual(computeRetryDelayMs(policy, 1), 500);
      assert.strictEqual(computeRetryDelayMs(policy, 2), 500);
    });

    it('computes exponential delay with maxDelayMs ceiling', () => {
      const policy = { mode: 'exponential', maxAttempts: 5, delayMs: 100, maxDelayMs: 500, jitterMs: 0 };
      assert.strictEqual(computeRetryDelayMs(policy, 1), 100); // 100 * 2^0
      assert.strictEqual(computeRetryDelayMs(policy, 2), 200); // 100 * 2^1
      assert.strictEqual(computeRetryDelayMs(policy, 3), 400); // 100 * 2^2
      assert.strictEqual(computeRetryDelayMs(policy, 4), 500); // capped at 500 (100 * 2^3 = 800 > 500)
    });

    it('applies jitter correctly without producing negative or infinite delays', () => {
      const policy = { mode: 'fixed', maxAttempts: 3, delayMs: 100, maxDelayMs: 1000, jitterMs: 50 };

      const delayMin = computeRetryDelayMs(policy, 1, () => 0);
      assert.strictEqual(delayMin, 100);

      const delayMax = computeRetryDelayMs(policy, 1, () => 0.99999);
      assert.strictEqual(delayMax, 150);
    });
  });

  describe('Pipeline Execution with Retry Policies', () => {
    function createMockRouter(routeImpl) {
      const logs = [];
      return {
        route: routeImpl,
        log: (msg) => logs.push(msg),
        getLogs: () => logs
      };
    }

    it('executes a step exactly once when retry is absent or mode: none', async () => {
      let callCount = 0;
      const router = createMockRouter(async () => {
        callCount++;
        return { success: false, error: 'Failed' };
      });

      const runner = new PipelineRunner(router);
      const pipelineData = {
        steps: [{ intent: 'system.toast', payload: { message: 'hi' } }]
      };

      await assert.rejects(
        async () => runner.runPipelineFromData(pipelineData),
        /Pipeline aborted at step 1/
      );
      assert.strictEqual(callCount, 1);
    });

    it('retries a step and succeeds on attempt 2', async () => {
      let callCount = 0;
      const router = createMockRouter(async () => {
        callCount++;
        if (callCount === 1) return { success: false, error: 'Transient error' };
        return { success: true, data: { status: 'recovered' } };
      });

      const runner = new PipelineRunner(router);
      const pipelineData = {
        steps: [
          {
            intent: 'network.request',
            retry: { mode: 'fixed', maxAttempts: 3, delayMs: 0 }
          }
        ]
      };

      const progressEvents = [];
      const res = await runner.runPipelineFromData(pipelineData, (p) => progressEvents.push(p));

      assert.strictEqual(res.success, true);
      assert.strictEqual(callCount, 2);
      assert.strictEqual(res.logs.length, 1);
      assert.strictEqual(res.logs[0].success, true);
      assert.strictEqual(res.logs[0].attempt, 2);
      assert.strictEqual(res.logs[0].maxAttempts, 3);

      const retryingEvent = progressEvents.find((e) => e.status === 'retrying');
      assert.ok(retryingEvent);
      assert.strictEqual(retryingEvent.attempt, 1);
      assert.strictEqual(retryingEvent.maxAttempts, 3);
      assert.strictEqual(retryingEvent.error, 'Transient error');
    });

    it('retries up to maxAttempts and triggers error path on final failure', async () => {
      let callCount = 0;
      const router = createMockRouter(async () => {
        callCount++;
        return { success: false, error: `Failure ${callCount}` };
      });

      const runner = new PipelineRunner(router);
      const pipelineData = {
        steps: [
          {
            intent: 'action.test',
            retry: { mode: 'fixed', maxAttempts: 3, delayMs: 0 }
          }
        ]
      };

      const progressEvents = [];
      await assert.rejects(
        async () => runner.runPipelineFromData(pipelineData, (p) => progressEvents.push(p)),
        /Pipeline aborted at step 1 \(action.test\): Failure 3/
      );

      assert.strictEqual(callCount, 3);
      const errorEvent = progressEvents.find((e) => e.status === 'error');
      assert.ok(errorEvent);
      assert.strictEqual(errorEvent.attempt, 3);
      assert.strictEqual(errorEvent.maxAttempts, 3);
      assert.strictEqual(errorEvent.error, 'Failure 3');
    });

    it('handles continueOnError only after retries are exhausted', async () => {
      let callCount = 0;
      const router = createMockRouter(async () => {
        callCount++;
        if (callCount <= 2) return { success: false, error: `Flake ${callCount}` };
        return { success: true, data: 'Step 2 success' };
      });

      const runner = new PipelineRunner(router);
      const pipelineData = {
        steps: [
          {
            intent: 'step.one',
            continueOnError: true,
            retry: { mode: 'fixed', maxAttempts: 2, delayMs: 0 }
          },
          { intent: 'step.two' }
        ]
      };

      const res = await runner.runPipelineFromData(pipelineData);
      assert.strictEqual(res.success, true);
      assert.strictEqual(callCount, 3); // 2 for step 1, 1 for step 2
      assert.strictEqual(res.logs.length, 2);
      assert.strictEqual(res.logs[0].success, false);
      assert.strictEqual(res.logs[0].attempt, 2);
      assert.strictEqual(res.logs[1].success, true);
      assert.strictEqual(res.logs[1].attempt, 1);
    });

    it('retries mock network timeout errors', async () => {
      let callCount = 0;
      const router = createMockRouter(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Network request timed out');
        return { success: true, data: { bytes: 123 } };
      });

      const runner = new PipelineRunner(router);
      const pipelineData = {
        steps: [
          {
            intent: 'network.request',
            retry: { mode: 'fixed', maxAttempts: 2, delayMs: 0 }
          }
        ]
      };

      const res = await runner.runPipelineFromData(pipelineData);
      assert.strictEqual(res.success, true);
      assert.strictEqual(callCount, 2);
    });

    it('cleans up active timers upon completion and when destroy is called', async () => {
      const router = createMockRouter(async () => ({ success: true }));
      const runner = new PipelineRunner(router);

      // Start a sleep timer
      const sleepPromise = runner.sleep(5000);
      assert.strictEqual(runner.activeTimers.size, 1);

      runner.destroy();
      assert.strictEqual(runner.activeTimers.size, 0);

      // Verify sleepPromise resolves without dangling
      await sleepPromise;
    });
  });
});

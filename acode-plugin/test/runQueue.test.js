const assert = require('assert');
const { IntentRouter, PipelineRunQueue, PipelineRunner } = require('../main.js');

function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runTests() {
  console.log('--- Starting PipelineRunQueue Unit Tests ---');

  // Test 1: Serialization of concurrent enqueues (maxConcurrentRuns = 1)
  {
    console.log('Test 1: Serialization with controlled promises');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1 });
    router.runQueue = queue;

    const defA = createDeferred();
    const defB = createDeferred();
    let runnerACalled = false;
    let runnerBCalled = false;

    router.pipelineRunner = {
      runPipelineFromData: async (data, onProgress, context) => {
        if (data.name === 'pipelineA') {
          runnerACalled = true;
          return defA.promise;
        } else if (data.name === 'pipelineB') {
          runnerBCalled = true;
          return defB.promise;
        }
      }
    };

    const pA = queue.enqueue({ pipelineData: { name: 'pipelineA', steps: [] }, source: 'manual' });
    const pB = queue.enqueue({ pipelineData: { name: 'pipelineB', steps: [] }, source: 'manual' });

    // Allow microtasks to execute
    await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(runnerACalled, true, 'Pipeline A should have started');
    assert.strictEqual(runnerBCalled, false, 'Pipeline B should NOT have started while A is active');

    const inspectRunning = queue.inspect();
    assert.strictEqual(inspectRunning.state, 'running');
    assert.strictEqual(inspectRunning.activeCount, 1);
    assert.strictEqual(inspectRunning.queuedCount, 1);
    assert.strictEqual(inspectRunning.active[0].pipelineName, 'pipelineA');
    assert.strictEqual(inspectRunning.pending[0].pipelineName, 'pipelineB');

    // Resolve A
    defA.resolve({ success: true, logs: [] });
    await pA;

    // Give time for drain to pick up B
    await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(runnerBCalled, true, 'Pipeline B should now have started after A resolved');

    defB.resolve({ success: true, logs: [] });
    await pB;

    const inspectIdle = queue.inspect();
    assert.strictEqual(inspectIdle.state, 'idle');
    assert.strictEqual(inspectIdle.activeCount, 0);
    assert.strictEqual(inspectIdle.queuedCount, 0);

    console.log('  PASSED');
  }

  // Test 2: FIFO ordering for 3+ runs
  {
    console.log('Test 2: FIFO ordering for 3 runs');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1 });
    router.runQueue = queue;

    const executionOrder = [];
    const defs = {
      p1: createDeferred(),
      p2: createDeferred(),
      p3: createDeferred()
    };

    router.pipelineRunner = {
      runPipelineFromData: async (data, onProgress, context) => {
        executionOrder.push(`start_${data.name}`);
        await defs[data.name].promise;
        executionOrder.push(`finish_${data.name}`);
        return { success: true };
      }
    };

    const run1 = queue.enqueue({ pipelineData: { name: 'p1', steps: [] }, source: 'manual' });
    const run2 = queue.enqueue({ pipelineData: { name: 'p2', steps: [] }, source: 'cron' });
    const run3 = queue.enqueue({ pipelineData: { name: 'p3', steps: [] }, source: 'agent' });

    await new Promise(r => setTimeout(r, 10));
    assert.deepStrictEqual(executionOrder, ['start_p1']);

    defs.p1.resolve();
    await run1;
    await new Promise(r => setTimeout(r, 10));
    assert.deepStrictEqual(executionOrder, ['start_p1', 'finish_p1', 'start_p2']);

    defs.p2.resolve();
    await run2;
    await new Promise(r => setTimeout(r, 10));
    assert.deepStrictEqual(executionOrder, ['start_p1', 'finish_p1', 'start_p2', 'finish_p2', 'start_p3']);

    defs.p3.resolve();
    await run3;
    assert.deepStrictEqual(executionOrder, ['start_p1', 'finish_p1', 'start_p2', 'finish_p2', 'start_p3', 'finish_p3']);

    console.log('  PASSED');
  }

  // Test 3: Rejection/failure releases queue and allows next run to start
  {
    console.log('Test 3: Failed run releases queue for subsequent runs');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1 });
    router.runQueue = queue;

    const defA = createDeferred();
    const defB = createDeferred();

    router.pipelineRunner = {
      runPipelineFromData: async (data, onProgress, context) => {
        if (data.name === 'failingA') return defA.promise;
        if (data.name === 'successB') return defB.promise;
      }
    };

    const runA = queue.enqueue({ pipelineData: { name: 'failingA', steps: [] }, source: 'manual' });
    const runB = queue.enqueue({ pipelineData: { name: 'successB', steps: [] }, source: 'manual' });

    await new Promise(r => setTimeout(r, 10));

    defA.reject(new Error('Pipeline A failed step 1'));
    await assert.rejects(runA, { message: 'Pipeline A failed step 1' });

    await new Promise(r => setTimeout(r, 10));

    defB.resolve({ success: true });
    const resultB = await runB;
    assert.deepStrictEqual(resultB, { success: true });

    console.log('  PASSED');
  }

  // Test 4: Queue capacity limit saturation
  {
    console.log('Test 4: Bounded queue capacity rejection');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1, maxQueueLength: 2 });
    router.runQueue = queue;

    const defActive = createDeferred();
    const defQ1 = createDeferred();
    const defQ2 = createDeferred();

    router.pipelineRunner = {
      runPipelineFromData: (data) => {
        if (data.name === 'active') return defActive.promise;
        if (data.name === 'q1') return defQ1.promise;
        if (data.name === 'q2') return defQ2.promise;
      }
    };

    // 1 active, 2 queued
    const rActive = queue.enqueue({ pipelineData: { name: 'active', steps: [] } });
    const rQueued1 = queue.enqueue({ pipelineData: { name: 'q1', steps: [] } });
    const rQueued2 = queue.enqueue({ pipelineData: { name: 'q2', steps: [] } });

    // 3rd queued item should be rejected immediately due to maxQueueLength = 2
    await assert.rejects(
      queue.enqueue({ pipelineData: { name: 'overflow', steps: [] } }),
      { message: 'Queue capacity reached (max 2 queued runs)' }
    );

    assert.strictEqual(queue.pending.length, 2);

    defActive.resolve({ success: true });
    await rActive;

    defQ1.resolve({ success: true });
    await rQueued1;

    defQ2.resolve({ success: true });
    await rQueued2;

    console.log('  PASSED');
  }

  // Test 5: Queue inspection action via router
  {
    console.log('Test 5: router:run_queue action inspection');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1 });
    router.runQueue = queue;
    router.setupCommands();

    const defManual = createDeferred();
    const defCron = createDeferred();

    router.pipelineRunner = {
      runPipelineFromData: (data) => {
        if (data.name === 'run_manual') return defManual.promise;
        if (data.name === 'run_cron') return defCron.promise;
      }
    };

    const rManual = queue.enqueue({ pipelineData: { name: 'run_manual', steps: [] }, source: 'manual' });
    const rCron = queue.enqueue({ pipelineData: { name: 'run_cron', steps: [] }, source: 'cron' });

    await new Promise(r => setTimeout(r, 10));

    const routeRes = await router.route({ action: 'router:run_queue' });
    assert.strictEqual(routeRes.success, true);
    assert.strictEqual(routeRes.data.state, 'running');
    assert.strictEqual(routeRes.data.activeCount, 1);
    assert.strictEqual(routeRes.data.queuedCount, 1);
    assert.strictEqual(routeRes.data.active[0].source, 'manual');
    assert.strictEqual(routeRes.data.pending[0].source, 'cron');

    defManual.resolve({ success: true });
    await rManual;

    defCron.resolve({ success: true });
    await rCron;

    console.log('  PASSED');
  }

  // Test 6: Destroy cleanup
  {
    console.log('Test 6: destroy() cancels pending runs');
    const router = new IntentRouter();
    const queue = new PipelineRunQueue(router, { maxConcurrentRuns: 1 });
    const def = createDeferred();

    router.pipelineRunner = {
      runPipelineFromData: () => def.promise
    };

    const rActive = queue.enqueue({ pipelineData: { name: 'active', steps: [] } });
    const rPending = queue.enqueue({ pipelineData: { name: 'pending', steps: [] } });

    queue.destroy();

    await assert.rejects(rPending, { message: 'PipelineRunQueue destroyed: queued run cancelled' });
    assert.strictEqual(queue.pending.length, 0);

    def.resolve();

    console.log('  PASSED');
  }

  console.log('--- ALL PIPELINE RUN QUEUE TESTS PASSED ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

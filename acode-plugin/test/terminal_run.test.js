const assert = require('assert');
const { IntentRouter, PipelineRunner } = require('../main.js');

describe('Acode bounded terminal.run', () => {
  let originalExecutor;
  let router;

  beforeEach(() => {
    originalExecutor = globalThis.Executor;
    router = new IntentRouter();
    router.modules = {
      fs: null,
      commands: null,
      toast: () => {},
      alert: () => {},
      terminal: {
        getAll: () => new Map(),
        get: () => null,
        createServer: async () => ({ id: 'interactive-1' }),
        write: () => {}
      }
    };
    router.setupCommands();
  });

  afterEach(() => {
    if (originalExecutor === undefined) delete globalThis.Executor;
    else globalThis.Executor = originalExecutor;
  });

  function streamingExecutor(startImpl) {
    const stopped = [];
    return {
      stopped,
      start: async (command, onData, alpine) => startImpl(command, onData, alpine),
      stop: async (id) => { stopped.push(id); return 'stopped'; }
    };
  }

  it('waits for exit and returns bounded stdout', async () => {
    let emit;
    globalThis.Executor = streamingExecutor(async (_command, onData) => {
      emit = onData;
      return 'proc-success';
    });

    let settled = false;
    const pending = router.route({
      intent: 'terminal.run',
      payload: { command: 'echo ok', timeoutMs: 1000, maxOutputBytes: 1024 }
    }).then(result => { settled = true; return result; });

    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(settled, false);
    emit('stdout', 'ok\n');
    emit('exit', 0);

    const result = await pending;
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.completed, true);
    assert.strictEqual(result.data.stdout, 'ok\n');
  });

  it('stops a process when streamed output crosses the byte budget', async () => {
    let emit;
    globalThis.Executor = streamingExecutor(async (_command, onData) => {
      emit = onData;
      return 'proc-large';
    });

    const pending = router.route({
      intent: 'terminal.run',
      payload: { command: 'lots', timeoutMs: 1000, maxOutputBytes: 8 }
    });
    await Promise.resolve();
    await Promise.resolve();
    emit('stdout', '123456789');

    const result = await pending;
    await Promise.resolve();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.metadata.code, 'terminal_output_too_large');
    assert.strictEqual(result.metadata.limit, 8);
    assert.deepStrictEqual(globalThis.Executor.stopped, ['proc-large']);
  });

  it('times out deterministically and stops a non-terminating process', async () => {
    globalThis.Executor = streamingExecutor(async () => 'proc-timeout');
    const result = await router.route({
      intent: 'terminal.run',
      payload: { command: 'never', timeoutMs: 10, maxOutputBytes: 1024 }
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.metadata.code, 'terminal_timeout');
    assert.deepStrictEqual(globalThis.Executor.stopped, ['proc-timeout']);
  });

  it('fails closed instead of falling back to unbounded execute()', async () => {
    let executeCalled = false;
    globalThis.Executor = {
      execute: async () => {
        executeCalled = true;
        return 'unsafe';
      }
    };
    const result = await router.route({ intent: 'terminal.run', payload: { command: 'echo unsafe' } });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.metadata.code, 'terminal_run_unavailable');
    assert.strictEqual(executeCalled, false);
  });

  it('quotes cwd and preserves terminal:exec separation', async () => {
    let observedCommand = null;
    let emit;
    globalThis.Executor = streamingExecutor(async (command, onData) => {
      observedCommand = command;
      emit = onData;
      return 'proc-cwd';
    });

    const pending = router.route({
      intent: 'terminal.run',
      payload: { command: 'pwd', cwd: "folder with 'quote'", timeoutMs: 1000 }
    });
    await Promise.resolve();
    await Promise.resolve();
    emit('exit', 0);
    const result = await pending;

    assert.strictEqual(result.success, true);
    assert.strictEqual(observedCommand, "cd 'folder with '\\''quote' && pwd");

    let interactiveWrites = 0;
    router.modules.terminal.write = () => { interactiveWrites += 1; };
    const execResult = await router.route({ intent: 'terminal.exec', payload: { command: 'top' } });
    assert.strictEqual(execResult.success, true);
    assert.strictEqual(execResult.data.submitted, true);
    assert.strictEqual(interactiveWrites, 1);
  });

  it('rejects onFailure cycles before any handler side effect', async () => {
    let starts = 0;
    globalThis.Executor = streamingExecutor(async () => {
      starts += 1;
      return 'never';
    });
    const runner = new PipelineRunner(router);

    await assert.rejects(
      () => runner.runPipelineFromData({
        steps: [
          { id: 'a', intent: 'terminal.run', payload: { command: 'a' }, onFailure: 'b' },
          { id: 'b', intent: 'terminal.run', payload: { command: 'b' }, onFailure: 'a' }
        ]
      }),
      err => err && err.code === 'pipeline_onfailure_cycle'
    );
    assert.strictEqual(starts, 0);
  });

  it('routes a real command failure to onFailure exactly once', async () => {
    const seen = [];
    globalThis.Executor = streamingExecutor(async (command, onData) => {
      const id = 'proc-' + seen.length;
      seen.push(command);
      setTimeout(() => {
        if (command === 'fail') {
          onData('stderr', 'failed');
          onData('exit', 1);
        } else {
          onData('stdout', 'recovered');
          onData('exit', 0);
        }
      }, 0);
      return id;
    });
    const runner = new PipelineRunner(router);

    const result = await runner.runPipelineFromData({
      steps: [
        { id: 'primary', intent: 'terminal.run', payload: { command: 'fail', timeoutMs: 1000 }, onFailure: 'recover' },
        { id: 'recover', intent: 'terminal.run', payload: { command: 'ok', timeoutMs: 1000 } }
      ]
    });

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(seen, ['fail', 'ok']);
    assert.strictEqual(result.logs.length, 2);
  });
});

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

const { IntentRouter, PipelineRunner } = require('../../acode-plugin/main.js');

class MockProcess extends EventEmitter {
  public id: string;
  constructor(id: string) {
    super();
    this.id = id;
  }
  stop() {
    this.emit('exit', 1);
  }
}

suite('Acode Plugin - terminal.run & Pipeline Runner (Mocked)', () => {
  let router: any;
  let runner: any;
  let originalExecutor: any;

  setup(() => {
    originalExecutor = (globalThis as any).Executor;
    delete (globalThis as any).Executor;

    router = new IntentRouter();
    router.modules = {
      fs: null,
      commands: null,
      toast: () => {},
      alert: () => {},
      terminal: {
        getAll: () => new Map(),
        get: () => null,
        createServer: async (opts: any) => ({ id: 'term-1', name: opts.name }),
        write: (id: string, text: string) => {}
      }
    };
    router.setupCommands();
    runner = new PipelineRunner(router);
  });

  teardown(() => {
    if (originalExecutor !== undefined) {
      (globalThis as any).Executor = originalExecutor;
    } else {
      delete (globalThis as any).Executor;
    }
  });

  test('intent normalization maps dots to colons for terminal.run', () => {
    const action = router.normalizeAction({ intent: 'terminal.run' });
    assert.strictEqual(action, 'terminal:run');
  });

  test('terminal:run uses globalThis.Executor.start/stop and returns stdout', async () => {
    let executedCmd = '';
    let executedAlpine: boolean | undefined = undefined;

    (globalThis as any).Executor = {
      start: (cmd: string, alpine?: boolean) => {
        executedCmd = cmd;
        executedAlpine = alpine;
        const proc = new MockProcess('p1');
        setImmediate(() => {
          proc.emit('stdout', 'build output successful');
          proc.emit('exit', 0);
        });
        return proc;
      },
      stop: () => {}
    };

    const res = await router.route({
      intent: 'terminal.run',
      payload: { command: 'npm test', alpine: true }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.completed, true);
    assert.strictEqual(res.data.stdout, 'build output successful');
    assert.strictEqual(executedCmd, 'npm test');
    assert.strictEqual(executedAlpine, true);
  });

  test('mock Executor with Promise control verifies step blocking', async () => {
    let step1Resolved = false;
    let step2Executed = false;

    let step1Proc: MockProcess | null = null;

    (globalThis as any).Executor = {
      start: (cmd: string) => {
        const proc = new MockProcess(cmd);
        if (cmd.includes('step1')) {
          step1Proc = proc;
        } else if (cmd.includes('step2')) {
          step2Executed = true;
          setImmediate(() => {
            proc.emit('stdout', 'step2 done');
            proc.emit('exit', 0);
          });
        }
        return proc;
      },
      stop: () => {}
    };

    const pipeline = {
      name: 'blocking-test',
      steps: [
        { id: 's1', intent: 'terminal.run', payload: { command: 'step1' } },
        { id: 's2', intent: 'terminal.run', payload: { command: 'step2' } }
      ]
    };

    const runPromise = runner.runPipelineFromData(pipeline);

    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(step1Resolved, false, 'Step 1 should still be pending');
    assert.strictEqual(step2Executed, false, 'Step 2 should not have started');

    if (step1Proc) {
      step1Resolved = true;
      (step1Proc as MockProcess).emit('stdout', 'step1 finished');
      (step1Proc as MockProcess).emit('exit', 0);
    }

    const result = await runPromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(step1Resolved, true);
    assert.strictEqual(step2Executed, true);
  });

  test('failing Executor command returns success: false and propagates error or onFailure', async () => {
    (globalThis as any).Executor = {
      start: (cmd: string) => {
        const proc = new MockProcess(cmd);
        setImmediate(() => {
          if (cmd.includes('fail-cmd')) {
            proc.emit('stderr', 'Command failed with exit code 1');
            proc.emit('exit', 1);
          } else {
            proc.emit('stdout', 'fallback step done');
            proc.emit('exit', 0);
          }
        });
        return proc;
      },
      stop: () => {}
    };

    const singleRouteRes = await router.route({
      intent: 'terminal.run',
      payload: { command: 'fail-cmd' }
    });

    assert.strictEqual(singleRouteRes.success, false);
    assert.ok(singleRouteRes.error.includes('exit code 1'));

    const pipelineWithOnFailure = {
      name: 'onfailure-test',
      steps: [
        { id: 'node_1', intent: 'terminal.run', payload: { command: 'fail-cmd' }, onFailure: 'node_3' },
        { id: 'node_2', intent: 'terminal.run', payload: { command: 'should-be-skipped' } },
        { id: 'node_3', intent: 'terminal.run', payload: { command: 'fallback-cmd' } }
      ]
    };

    const pipelineResult = await runner.runPipelineFromData(pipelineWithOnFailure);
    assert.strictEqual(pipelineResult.success, true);
    assert.strictEqual(pipelineResult.logs.length, 2);
    assert.strictEqual(pipelineResult.logs[0].id, 'node_1');
    assert.strictEqual(pipelineResult.logs[0].success, false);
    assert.strictEqual(pipelineResult.logs[1].id, 'node_3');
    assert.strictEqual(pipelineResult.logs[1].success, true);
  });

  test('rejects onFailure cycles before any handler side effect', async () => {
    let handlerCalled = false;
    (globalThis as any).Executor = {
      start: () => {
        handlerCalled = true;
        const proc = new MockProcess('p');
        setImmediate(() => proc.emit('exit', 0));
        return proc;
      },
      stop: () => {}
    };

    const cyclicPipeline = {
      name: 'cyclic',
      steps: [
        { id: 'node_1', intent: 'terminal.run', payload: { command: 'a' }, onFailure: 'node_2' },
        { id: 'node_2', intent: 'terminal.run', payload: { command: 'b' }, onFailure: 'node_1' }
      ]
    };

    await assert.rejects(
      async () => {
        await runner.runPipelineFromData(cyclicPipeline);
      },
      /onFailure cycle detected/
    );

    assert.strictEqual(handlerCalled, false, 'No handler side effect should occur before cycle rejection');
  });

  test('cwd with spaces and quoting characters is safely escaped', async () => {
    const executedCmds: string[] = [];

    (globalThis as any).Executor = {
      start: (cmd: string) => {
        executedCmds.push(cmd);
        const proc = new MockProcess(cmd);
        setImmediate(() => proc.emit('exit', 0));
        return proc;
      },
      stop: () => {}
    };

    const cwdSpace = 'folder with spaces';
    await router.route({
      intent: 'terminal.run',
      payload: { command: 'npm install', cwd: cwdSpace }
    });

    assert.strictEqual(executedCmds[0], "cd 'folder with spaces' && npm install");

    const cwdQuotes = "path/with'single'quote & \"double\"";
    await router.route({
      intent: 'terminal.run',
      payload: { command: 'ls -la', cwd: cwdQuotes }
    });

    const expectedEscaped = "cd 'path/with'\\''single'\\''quote & \"double\"' && ls -la";
    assert.strictEqual(executedCmds[1], expectedEscaped);
  });

  test('absence of globalThis.Executor or start/stop fails explicitly', async () => {
    let writeCalled = false;
    router.modules.terminal.write = () => {
      writeCalled = true;
    };

    const res = await router.route({
      intent: 'terminal.run',
      payload: { command: 'npm install' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(
      res.error,
      'terminal.run unavailable: bounded Executor.start/stop required'
    );
    assert.strictEqual(writeCalled, false, 'Must not fall back to terminal.write');
  });

  test('terminal:exec preserves interactive fire-and-forget behavior', async () => {
    let writtenText = '';
    router.modules.terminal.write = (id: string, text: string) => {
      writtenText = text;
    };

    const res = await router.route({
      intent: 'terminal.exec',
      payload: { command: 'top' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.submitted, true);
    assert.strictEqual(writtenText, 'top\r');
  });

  test('fixture pipeline/install .vsix.intent.json reaches terminal:run handler', async () => {
    const executedCmds: string[] = [];

    (globalThis as any).Executor = {
      start: (cmd: string) => {
        executedCmds.push(cmd);
        const proc = new MockProcess(cmd);
        setImmediate(() => {
          proc.emit('stdout', 'mock build stdout');
          proc.emit('exit', 0);
        });
        return proc;
      },
      stop: () => {}
    };

    router.register('vscode:runCommand', async () => {
      return { executed: true };
    });

    const fixturePath = path.resolve(__dirname, '../../pipeline/install .vsix.intent.json');
    const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
    const fixtureData = JSON.parse(fixtureContent);

    const result = await runner.runPipelineFromData(fixtureData);

    assert.strictEqual(result.success, true);
    assert.strictEqual(executedCmds.length, 3);
    assert.strictEqual(executedCmds[0], "cd '.' && npm install");
    assert.strictEqual(executedCmds[1], "cd '.' && npm run compile");
    assert.strictEqual(executedCmds[2], "cd '.' && vsce package");
  });
});

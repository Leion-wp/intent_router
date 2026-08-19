import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const { IntentRouter, PipelineRunner } = require('../../acode-plugin/main.js');

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

  test('terminal:run uses globalThis.Executor.execute and returns stdout', async () => {
    let executedCmd = '';
    let executedAlpine: boolean | undefined = undefined;

    (globalThis as any).Executor = {
      execute: async (cmd: string, alpine?: boolean) => {
        executedCmd = cmd;
        executedAlpine = alpine;
        return 'build output successful';
      }
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
    let resolveStep1Promise: (val: string) => void = () => {};

    const step1Promise = new Promise<string>((resolve) => {
      resolveStep1Promise = resolve;
    });

    (globalThis as any).Executor = {
      execute: async (cmd: string) => {
        if (cmd.includes('step1')) {
          const val = await step1Promise;
          step1Resolved = true;
          return val;
        }
        if (cmd.includes('step2')) {
          step2Executed = true;
          return 'step2 done';
        }
        return '';
      }
    };

    const pipeline = {
      name: 'blocking-test',
      steps: [
        { id: 's1', intent: 'terminal.run', payload: { command: 'step1' } },
        { id: 's2', intent: 'terminal.run', payload: { command: 'step2' } }
      ]
    };

    const runPromise = runner.runPipelineFromData(pipeline);

    // Give microtasks time to execute step 1
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(step1Resolved, false, 'Step 1 should still be pending');
    assert.strictEqual(step2Executed, false, 'Step 2 should not have started');

    resolveStep1Promise('step1 finished');
    const result = await runPromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(step1Resolved, true);
    assert.strictEqual(step2Executed, true);
  });

  test('failing Executor command returns success: false and propagates error or onFailure', async () => {
    (globalThis as any).Executor = {
      execute: async (cmd: string) => {
        if (cmd.includes('fail-cmd')) {
          throw new Error('Command failed with exit code 1');
        }
        return 'fallback step done';
      }
    };

    const singleRouteRes = await router.route({
      intent: 'terminal.run',
      payload: { command: 'fail-cmd' }
    });

    assert.strictEqual(singleRouteRes.success, false);
    assert.ok(singleRouteRes.error.includes('Command failed with exit code 1'));

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

  test('cwd with spaces and quoting characters is safely escaped', async () => {
    const executedCmds: string[] = [];

    (globalThis as any).Executor = {
      execute: async (cmd: string) => {
        executedCmds.push(cmd);
        return 'ok';
      }
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

  test('absence of globalThis.Executor fails explicitly with terminal.run unavailable', async () => {
    let writeCalled = false;
    router.modules.terminal.write = () => {
      writeCalled = true;
    };

    const res = await router.route({
      intent: 'terminal.run',
      payload: { command: 'npm install' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'terminal.run unavailable');
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
      execute: async (cmd: string) => {
        executedCmds.push(cmd);
        return 'mock build stdout';
      }
    };

    // Register dummy handler for vscode:runCommand
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

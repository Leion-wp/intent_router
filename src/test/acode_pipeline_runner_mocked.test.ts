import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Acode PipelineRunner (Mocked)', () => {
  let pipelineRunner: any;
  let mockRouter: any;

  setup(() => {
    const mainJsPath = path.resolve(__dirname, '../../acode-plugin/main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

    const routedCalls: any[] = [];
    mockRouter = {
      commands: new Map(),
      logs: [],
      log(msg: string) {
        this.logs.push(msg);
      },
      async route(intent: any) {
        routedCalls.push(intent);
        if (intent.action === 'terminal:run' || intent.action === 'file:read') {
          return { success: true, data: { routedAction: intent.action, payload: intent.data } };
        }
        if (intent.action === 'fail:step') {
          return { success: false, error: 'Step failed intentionally' };
        }
        return { success: true, data: { routedAction: intent.action } };
      },
      routedCalls
    };

    // Evaluate main.js or extract PipelineRunner class using Function constructor in clean scope
    const windowObj: any = {};
    const evalScope = Function('window', 'acode', 'editorManager', 'navigator', 'fetch', `
      ${mainJsContent.replace('class PipelineRunner', 'window.PipelineRunner = class PipelineRunner').replace('class IntentRouter', 'window.IntentRouter = class IntentRouter')}
    `);

    evalScope(windowObj, {}, {}, { userAgent: 'test' }, () => Promise.resolve());
    pipelineRunner = new windowObj.PipelineRunner(mockRouter);
  });

  test('mapIntentToAction converts dots to colons accurately', () => {
    assert.strictEqual(pipelineRunner.mapIntentToAction('terminal.run'), 'terminal:run');
    assert.strictEqual(pipelineRunner.mapIntentToAction('file.read'), 'file:read');
    assert.strictEqual(pipelineRunner.mapIntentToAction('vscode.runCommand'), 'vscode:runCommand');
    assert.strictEqual(pipelineRunner.mapIntentToAction('custom.domain.action'), 'custom:domain:action');
    assert.strictEqual(pipelineRunner.mapIntentToAction('terminal:run'), 'terminal:run');
  });

  test('mapIntentToAction rejects missing or malformed intents', () => {
    assert.throws(() => pipelineRunner.mapIntentToAction(''), /Missing or invalid intent name/);
    assert.throws(() => pipelineRunner.mapIntentToAction('  '), /Missing or invalid intent name/);
    assert.throws(() => pipelineRunner.mapIntentToAction(null as any), /Missing or invalid intent name/);
    assert.throws(() => pipelineRunner.mapIntentToAction('invalidNoSeparator'), /Malformed intent/);
    assert.throws(() => pipelineRunner.mapIntentToAction('domain.'), /Malformed intent/);
    assert.throws(() => pipelineRunner.mapIntentToAction('.action'), /Malformed intent/);
  });

  test('runPipelineFromData executes valid steps up to router without mapping errors', async () => {
    const pipelineData = {
      steps: [
        { intent: 'terminal.run', payload: { command: 'echo hello' } },
        { intent: 'file.read', payload: { path: '/tmp/test.txt' } }
      ]
    };

    const progressLogs: any[] = [];
    const res = await pipelineRunner.runPipelineFromData(pipelineData, (p: any) => progressLogs.push(p));

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.logs.length, 2);
    assert.strictEqual(mockRouter.routedCalls.length, 2);
    assert.strictEqual(mockRouter.routedCalls[0].action, 'terminal:run');
    assert.strictEqual(mockRouter.routedCalls[1].action, 'file:read');
  });

  test('runPipelineFromData stops and throws explicit error on invalid intent step', async () => {
    const pipelineData = {
      steps: [
        { intent: 'terminal.run', payload: { command: 'echo hello' } },
        { intent: 'malformedStep', payload: {} }
      ]
    };

    await assert.rejects(
      async () => {
        await pipelineRunner.runPipelineFromData(pipelineData);
      },
      /Pipeline aborted at step 2: Malformed intent/
    );

    // Only first step reached router
    assert.strictEqual(mockRouter.routedCalls.length, 1);
    assert.strictEqual(mockRouter.routedCalls[0].action, 'terminal:run');
  });
});

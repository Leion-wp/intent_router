import * as assert from 'assert';
import * as cp from 'child_process';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const {
  executeAiCommand,
  executeAiTeamCommand,
  parseBudgetTimeout,
  parseMaxProviderCalls
} = require('../../out/providers/aiAdapter');
const { pipelineEventBus } = require('../../out/eventBus');

Module.prototype.require = originalRequire;

suite('AI Budget and Timeout Execution Guards (Mocked)', () => {
  let originalSpawn: any;

  setup(() => {
    originalSpawn = cp.spawn;
  });

  teardown(() => {
    (cp as any).spawn = originalSpawn;
  });

  test('parseBudgetTimeout and parseMaxProviderCalls validate inputs correctly', () => {
    assert.strictEqual(parseBudgetTimeout(undefined), undefined);
    assert.strictEqual(parseBudgetTimeout(null), undefined);
    assert.strictEqual(parseBudgetTimeout(''), undefined);
    assert.strictEqual(parseBudgetTimeout(' 5000 '), 5000);
    assert.strictEqual(parseBudgetTimeout(1200), 1200);

    assert.throws(() => parseBudgetTimeout('invalid'), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');
    assert.throws(() => parseBudgetTimeout(-100), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');
    assert.throws(() => parseBudgetTimeout(0), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');

    assert.strictEqual(parseMaxProviderCalls(undefined), undefined);
    assert.strictEqual(parseMaxProviderCalls('3'), 3);
    assert.strictEqual(parseMaxProviderCalls(2), 2);

    assert.throws(() => parseMaxProviderCalls('abc'), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');
    assert.throws(() => parseMaxProviderCalls(0), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');
    assert.throws(() => parseMaxProviderCalls(-5), (err: any) => err.isBudgetError && err.code === 'ERR_INVALID_BUDGET_PARAM');
  });

  test('ai.generate without timeoutMs behaves normally', async () => {
    (cp as any).spawn = (command: string, args: string[]) => {
      const listeners: Record<string, Function[]> = {};
      const stdoutListeners: Function[] = [];
      const stderrListeners: Function[] = [];

      const child = {
        stdin: { write: () => {}, end: () => {} },
        stdout: { on: (event: string, fn: Function) => stdoutListeners.push(fn), removeAllListeners: () => {} },
        stderr: { on: (event: string, fn: Function) => stderrListeners.push(fn), removeAllListeners: () => {} },
        on: (event: string, fn: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        removeAllListeners: () => {},
        kill: () => {}
      };

      setTimeout(() => {
        stdoutListeners.forEach((fn) => fn('[PATH]file.ts[/PATH][RESULT]content[/RESULT]'));
        (listeners['close'] || []).forEach((fn) => fn(0));
      }, 10);

      return child as any;
    };

    const res = await executeAiCommand({ instruction: 'test normal' });
    assert.strictEqual(res.path, 'file.ts');
    assert.strictEqual(res.content, 'content');
  });

  test('ai.generate with timeoutMs terminates hanging process and rejects with AiBudgetError', async () => {
    let killCalled = false;

    (cp as any).spawn = () => {
      const child = {
        stdin: { write: () => {}, end: () => {} },
        stdout: { on: () => {}, removeAllListeners: () => {} },
        stderr: { on: () => {}, removeAllListeners: () => {} },
        on: () => {},
        removeAllListeners: () => {},
        kill: (sig: string) => {
          if (sig === 'SIGTERM' || sig === 'SIGKILL') {
            killCalled = true;
          }
        }
      };
      return child as any;
    };

    await assert.rejects(
      async () => {
        await executeAiCommand({ instruction: 'hang', timeoutMs: 30 });
      },
      (err: any) => {
        assert.ok(err.isBudgetError, 'Expected err.isBudgetError to be true');
        assert.strictEqual(err.code, 'ERR_AI_TIMEOUT');
        assert.ok(err.message.includes('exceeded limit of 30ms'));
        return true;
      }
    );

    assert.ok(killCalled, 'Child process kill() should have been called on timeout');
  });

  test('ai.team caps execution at maxProviderCalls across 4 members', async () => {
    let spawnCount = 0;

    (cp as any).spawn = () => {
      spawnCount += 1;
      const stdoutListeners: Function[] = [];
      const listeners: Record<string, Function[]> = {};

      const child = {
        stdin: { write: () => {}, end: () => {} },
        stdout: { on: (event: string, fn: Function) => stdoutListeners.push(fn), removeAllListeners: () => {} },
        stderr: { on: () => {}, removeAllListeners: () => {} },
        on: (event: string, fn: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        removeAllListeners: () => {},
        kill: () => {}
      };

      setTimeout(() => {
        stdoutListeners.forEach((fn) => fn(`[PATH]f${spawnCount}.ts[/PATH][RESULT]res${spawnCount}[/RESULT]`));
        (listeners['close'] || []).forEach((fn) => fn(0));
      }, 10);

      return child as any;
    };

    let summaryEvent: any = null;
    const disposable = pipelineEventBus.on((evt: any) => {
      if (evt.type === 'teamRunSummary') {
        summaryEvent = evt;
      }
    });

    try {
      await executeAiTeamCommand({
        strategy: 'sequential',
        maxProviderCalls: 2,
        members: [
          { name: 'm1', instruction: 'inst 1' },
          { name: 'm2', instruction: 'inst 2' },
          { name: 'm3', instruction: 'inst 3' },
          { name: 'm4', instruction: 'inst 4' }
        ],
        __meta: { runId: 'run1', traceId: 't1' }
      });
      assert.fail('Expected team command to throw budget error on 3rd call');
    } catch (err: any) {
      assert.ok(err.isBudgetError);
      assert.strictEqual(err.code, 'ERR_AI_MAX_CALLS_EXCEEDED');
    } finally {
      disposable.dispose();
    }

    assert.strictEqual(spawnCount, 2, 'Exactly 2 provider CLI calls should have spawned');
    assert.ok(summaryEvent, 'teamRunSummary event should have been emitted');
    assert.strictEqual(summaryEvent.providerCallsStarted, 2);
    assert.strictEqual(summaryEvent.budgetExceeded, true);
    assert.strictEqual(summaryEvent.budgetReason, 'max_provider_calls');
  });

  test('ai.team strategy reviewer_gate stops cleanly when budget is reached mid-execution', async () => {
    let spawnCount = 0;

    (cp as any).spawn = () => {
      spawnCount += 1;
      const stdoutListeners: Function[] = [];
      const listeners: Record<string, Function[]> = {};

      const child = {
        stdin: { write: () => {}, end: () => {} },
        stdout: { on: (event: string, fn: Function) => stdoutListeners.push(fn), removeAllListeners: () => {} },
        stderr: { on: () => {}, removeAllListeners: () => {} },
        on: (event: string, fn: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        removeAllListeners: () => {},
        kill: () => {}
      };

      setTimeout(() => {
        stdoutListeners.forEach((fn) => fn(`[PATH]f${spawnCount}.ts[/PATH][RESULT]res${spawnCount}[/RESULT]`));
        (listeners['close'] || []).forEach((fn) => fn(0));
      }, 5);

      return child as any;
    };

    await assert.rejects(
      async () => {
        await executeAiTeamCommand({
          strategy: 'reviewer_gate',
          maxProviderCalls: 1,
          members: [
            { name: 'writer', role: 'writer', instruction: 'write' },
            { name: 'reviewer', role: 'reviewer', instruction: 'review' }
          ]
        });
      },
      (err: any) => {
        assert.ok(err.isBudgetError);
        assert.strictEqual(err.code, 'ERR_AI_MAX_CALLS_EXCEEDED');
        return true;
      }
    );

    assert.strictEqual(spawnCount, 1);
  });

  test('failed provider call counts towards started provider calls in budget', async () => {
    let spawnCount = 0;

    (cp as any).spawn = () => {
      spawnCount += 1;
      const stderrListeners: Function[] = [];
      const listeners: Record<string, Function[]> = {};

      const child = {
        stdin: { write: () => {}, end: () => {} },
        stdout: { on: () => {}, removeAllListeners: () => {} },
        stderr: { on: (event: string, fn: Function) => stderrListeners.push(fn), removeAllListeners: () => {} },
        on: (event: string, fn: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        removeAllListeners: () => {},
        kill: () => {}
      };

      setTimeout(() => {
        stderrListeners.forEach((fn) => fn('CLI crash'));
        (listeners['close'] || []).forEach((fn) => fn(1));
      }, 5);

      return child as any;
    };

    await assert.rejects(
      async () => {
        await executeAiTeamCommand({
          strategy: 'sequential',
          maxProviderCalls: 2,
          members: [
            { name: 'm1', instruction: 'inst 1' },
            { name: 'm2', instruction: 'inst 2' }
          ]
        });
      },
      (err: any) => {
        assert.ok(String(err.message).includes('Agent exited with code 1'));
        return true;
      }
    );

    assert.strictEqual(spawnCount, 1);
  });
});

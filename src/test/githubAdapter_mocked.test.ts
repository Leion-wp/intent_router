import * as assert from 'assert';
import { EventEmitter } from 'events';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const childProcess = require('child_process');
const {
  executeGitHubOpenPr,
  executeGitHubPrChecks,
  executeGitHubPrRerunFailedChecks,
  executeGitHubPrComment,
  validateGitBranchRef
} = require('../../out/providers/githubAdapter');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('GitHub Adapter (Mocked)', () => {
  let originalSpawn: any;

  setup(() => {
    originalSpawn = childProcess.spawn;
  });

  teardown(() => {
    childProcess.spawn = originalSpawn;
  });

  test('creates PR and emits URL event/log', async () => {
    childProcess.spawn = (_command: string, _args: string[]) => {
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('{"url":"https://github.com/acme/repo/pull/42","number":42,"state":"OPEN","isDraft":false}'));
        child.emit('close', 0);
      });
      return child;
    };

    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => events.push(event));

    try {
      const result = await executeGitHubOpenPr({
        head: 'feature/TICKET-1-frontend',
        base: 'main',
        title: 'feat(frontend): TICKET-1',
        cwd: '${workspaceRoot}',
        __meta: { runId: 'r1', traceId: 't1', stepId: 's1' }
      });

      assert.strictEqual(result.url, 'https://github.com/acme/repo/pull/42');
      assert.strictEqual(result.number, 42);
      assert.strictEqual(result.state, 'open');
      assert.strictEqual(result.isDraft, false);
      assert.ok(events.some((event) => event.type === 'githubPullRequestCreated' && event.url.includes('/pull/42')));
      assert.ok(events.some((event) => event.type === 'githubPullRequestCreated' && event.number === 42 && event.state === 'open'));
      assert.ok(events.some((event) => event.type === 'stepLog' && String(event.text || '').includes('PR created')));
    } finally {
      sub.dispose();
    }
  });

  test('rejects invalid branch names before spawn', async () => {
    let spawnCalled = false;
    childProcess.spawn = () => {
      spawnCalled = true;
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    };

    let failed = false;
    try {
      await executeGitHubOpenPr({
        head: 'feature bad branch',
        base: 'main',
        title: 'invalid branch',
        cwd: '${workspaceRoot}'
      });
    } catch {
      failed = true;
    }

    assert.strictEqual(failed, true);
    assert.strictEqual(spawnCalled, false);
    assert.throws(() => validateGitBranchRef('main..bad', 'head'));
  });

  test('fetches PR checks from URL', async () => {
    let seenArgs: string[] = [];
    childProcess.spawn = (_command: string, args: string[]) => {
      seenArgs = args;
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('checks ok'));
        child.emit('close', 0);
      });
      return child;
    };

    const result = await executeGitHubPrChecks({
      url: 'https://github.com/acme/repo/pull/12'
    });
    assert.strictEqual(result.repo, 'acme/repo');
    assert.strictEqual(result.number, 12);
    assert.strictEqual(String(result.output).includes('checks ok'), true);
    assert.ok(seenArgs.includes('checks'));
    assert.ok(seenArgs.includes('--repo'));
  });

  test('reruns failed checks and comments on PR', async () => {
    const calls: string[][] = [];
    childProcess.spawn = (_command: string, args: string[]) => {
      calls.push(args);
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit('close', 0));
      return child;
    };

    await executeGitHubPrRerunFailedChecks({ url: 'https://github.com/acme/repo/pull/13' });
    await executeGitHubPrComment({ url: 'https://github.com/acme/repo/pull/13', body: 'looks good' });

    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0].includes('--rerun-failed'));
    assert.ok(calls[1].includes('comment'));
    assert.ok(calls[1].includes('--body'));
  });
});

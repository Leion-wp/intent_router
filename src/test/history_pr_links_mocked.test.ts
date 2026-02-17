import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const { historyManager } = require('../../out/historyManager');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('History PR Links (Mocked)', () => {
  test('stores github PR links in current run history', async () => {
    historyManager.getHistory().length = 0;

    pipelineEventBus.emit({
      type: 'pipelineStart',
      runId: 'run-pr',
      timestamp: Date.now(),
      name: 'factory-run'
    });

    pipelineEventBus.emit({
      type: 'githubPullRequestCreated',
      runId: 'run-pr',
      intentId: 'intent-1',
      stepId: 'factory.open_frontend_pr',
      provider: 'github',
      url: 'https://github.com/acme/repo/pull/101',
      number: 101,
      state: 'open',
      isDraft: false,
      head: 'feature/TICKET-1-frontend',
      base: 'main',
      title: 'feat(frontend): TICKET-1'
    });

    pipelineEventBus.emit({
      type: 'pipelineEnd',
      runId: 'run-pr',
      timestamp: Date.now(),
      success: true,
      status: 'success'
    });

    const run = historyManager.getHistory()[0];
    assert.ok(run, 'expected one run in history');
    assert.ok(Array.isArray(run.pullRequests), 'expected pullRequests array');
    assert.strictEqual(run.pullRequests.length, 1);
    assert.strictEqual(run.pullRequests[0].url, 'https://github.com/acme/repo/pull/101');
    assert.strictEqual(run.pullRequests[0].number, 101);
    assert.strictEqual(run.pullRequests[0].state, 'open');
  });
});

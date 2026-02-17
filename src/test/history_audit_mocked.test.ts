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

suite('History Audit (Mocked)', () => {
  test('captures review signature, hitl decision and exports audit', () => {
    historyManager.getHistory().length = 0;
    const now = Date.now();

    pipelineEventBus.emit({
      type: 'pipelineStart',
      runId: 'run-audit',
      timestamp: now,
      name: 'audit-run'
    });

    pipelineEventBus.emit({
      type: 'stepStart',
      runId: 'run-audit',
      intentId: 'intent-1',
      stepId: 'agent.step',
      intent: 'ai.generate',
      timestamp: now + 1
    });
    pipelineEventBus.emit({
      type: 'stepEnd',
      runId: 'run-audit',
      intentId: 'intent-1',
      stepId: 'agent.step',
      success: true,
      timestamp: now + 2
    });

    pipelineEventBus.emit({
      type: 'approvalReviewReady',
      runId: 'run-audit',
      intentId: 'intent-2',
      stepId: 'approve.step',
      files: [{ path: 'README.md', added: 1, removed: 0 }],
      totalAdded: 1,
      totalRemoved: 0,
      diffSignature: 'abc123',
      policyMode: 'warn',
      policyBlocked: false,
      policyViolations: []
    });
    pipelineEventBus.emit({
      type: 'pipelineDecision',
      runId: 'run-audit',
      nodeId: 'approve.step',
      decision: 'approve',
      approvedPaths: ['README.md']
    });

    pipelineEventBus.emit({
      type: 'pipelineEnd',
      runId: 'run-audit',
      timestamp: now + 3,
      success: true,
      status: 'success'
    });

    const run = historyManager.getHistory()[0];
    assert.ok(run, 'expected history run');
    assert.ok(run.audit, 'expected run audit');
    assert.strictEqual(run.audit.reviews.length, 1);
    assert.strictEqual(run.audit.reviews[0].diffSignature, 'abc123');
    assert.strictEqual(run.audit.hitl.length, 1);
    assert.strictEqual(run.audit.hitl[0].decision, 'approve');
    assert.ok(run.audit.cost.estimatedTotal >= 1);

    const exported = historyManager.buildRunAuditExport('run-audit');
    assert.ok(exported, 'expected exported audit');
    assert.strictEqual(exported.audit.reviews[0].diffSignature, 'abc123');
    assert.strictEqual(exported.audit.hitl[0].decision, 'approve');
  });
});

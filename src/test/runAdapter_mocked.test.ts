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

const { executeRunMetricCommand, executeRunAlertCommand } = require('../../out/providers/runAdapter');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('Run Adapter (Mocked)', () => {
  test('run.metric emits event and returns structured payload', async () => {
    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => {
      if (event?.type === 'runMetricRecorded') {
        events.push(event);
      }
    });

    try {
      const result = await executeRunMetricCommand({
        key: 'latency_ms',
        value: '125',
        unit: 'ms',
        aggregation: 'gauge',
        tags: 'n8n,webhook',
        __meta: {
          runId: 'run_1',
          traceId: 'trace_1',
          stepId: 'metric_step'
        }
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].key, 'latency_ms');
      assert.strictEqual(events[0].value, 125);
      assert.deepStrictEqual(events[0].tags, ['n8n', 'webhook']);
      assert.ok(String(result.content).includes('"latency_ms"'));
    } finally {
      sub.dispose();
    }
  });

  test('run.alert emits event and parses JSON details', async () => {
    const events: any[] = [];
    const sub = pipelineEventBus.on((event: any) => {
      if (event?.type === 'runAlertRaised') {
        events.push(event);
      }
    });

    try {
      const result = await executeRunAlertCommand({
        level: 'error',
        title: 'n8n timeout',
        message: 'Webhook call exceeded threshold',
        details: '{"thresholdMs":2000,"observedMs":5120}',
        __meta: {
          runId: 'run_2',
          traceId: 'trace_2',
          stepId: 'alert_step'
        }
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].level, 'error');
      assert.strictEqual(events[0].title, 'n8n timeout');
      assert.strictEqual(events[0].details.thresholdMs, 2000);
      assert.ok(String(result.content).includes('Webhook call exceeded threshold'));
    } finally {
      sub.dispose();
    }
  });
});

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

const { runPipelineFromData } = require('../../out/pipelineRunner');
const { pipelineEventBus } = require('../../out/eventBus');
Module.prototype.require = originalRequire;

suite('Pipeline Form Dynamic Options (Mocked)', () => {
  suiteTeardown(() => {
    Module.prototype.require = originalRequire;
  });

  test('system.form select accepts variable-backed JSON options with label/value pairs', async () => {
    const quickPickCalls: any[] = [];
    const originalShowQuickPick = mockVscode.window.showQuickPick;

    mockVscode.window.showQuickPick = async (items: any[], options: any) => {
      quickPickCalls.push({ items, options });
      return items[1];
    };

    const executedStepIds: string[] = [];
    const sub = pipelineEventBus.on((event: any) => {
      if (event.type === 'stepStart' && event.stepId) {
        executedStepIds.push(String(event.stepId));
      }
    });

    try {
      const pipeline = {
        name: 'dynamic-form-options',
        steps: [
          {
            id: 'set_options',
            intent: 'system.setVar',
            payload: {
              name: 'webhook_options',
              value: '[{\"label\":\"Workflow A\",\"value\":\"wf_a.n8n\"},{\"label\":\"Workflow B\",\"value\":\"wf_b.n8n\"}]'
            }
          },
          {
            id: 'pick_workflow',
            intent: 'system.form',
            payload: {
              fields: [
                {
                  type: 'select',
                  label: 'Workflow',
                  key: 'selected_workflow',
                  required: true,
                  options: '${var:webhook_options}'
                }
              ]
            }
          },
          {
            id: 'route_workflow',
            intent: 'system.switch',
            payload: {
              variableKey: 'selected_workflow',
              routes: [
                {
                  label: 'workflow-b',
                  condition: 'contains',
                  value: 'wf_b.n8n',
                  targetStepId: 'hit_workflow_b'
                }
              ],
              defaultStepId: 'hit_default'
            }
          },
          {
            id: 'hit_workflow_b',
            intent: 'system.setVar',
            payload: { name: 'result', value: 'workflow-b' }
          },
          {
            id: 'hit_default',
            intent: 'system.setVar',
            payload: { name: 'result', value: 'default' }
          }
        ]
      };

      const result = await runPipelineFromData(pipeline as any, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(quickPickCalls.length, 1);
      assert.deepStrictEqual(
        quickPickCalls[0].items.map((item: any) => ({ label: item.label, value: item.value })),
        [
          { label: 'Workflow A', value: 'wf_a.n8n' },
          { label: 'Workflow B', value: 'wf_b.n8n' }
        ]
      );
      assert.ok(executedStepIds.includes('hit_workflow_b'), `Expected workflow B branch. Got: ${executedStepIds.join(', ')}`);
      assert.ok(!executedStepIds.includes('hit_default'), `Default branch should not run. Got: ${executedStepIds.join(', ')}`);
    } finally {
      sub.dispose();
      mockVscode.window.showQuickPick = originalShowQuickPick;
    }
  });

  test('system.form select can capture metadata fields from the selected option', async () => {
    const originalShowQuickPick = mockVscode.window.showQuickPick;
    const executedStepIds: string[] = [];
    const sub = pipelineEventBus.on((event: any) => {
      if (event.type === 'stepStart' && event.stepId) {
        executedStepIds.push(String(event.stepId));
      }
    });

    mockVscode.window.showQuickPick = async (items: any[]) => items[0];

    try {
      const pipeline = {
        name: 'dynamic-form-metadata-capture',
        steps: [
          {
            id: 'set_options',
            intent: 'system.setVar',
            payload: {
              name: 'webhook_options',
              value: '[{\"label\":\"Workflow A [POST]\",\"value\":\"http://localhost:5678/webhook-test/a\",\"method\":\"POST\",\"testUrl\":\"http://localhost:5678/webhook-test/a\",\"prodUrl\":\"http://localhost:5678/webhook/a\"}]'
            }
          },
          {
            id: 'pick_workflow',
            intent: 'system.form',
            payload: {
              fields: [
                {
                  type: 'select',
                  label: 'Workflow',
                  key: 'selected_workflow',
                  required: true,
                  options: '${var:webhook_options}',
                  captureMap: {
                    selected_method: 'method',
                    selected_test_url: 'testUrl',
                    selected_prod_url: 'prodUrl'
                  }
                }
              ]
            }
          },
          {
            id: 'set_url',
            intent: 'system.setVar',
            payload: {
              name: 'selected_url',
              value: '${var:selected_test_url}'
            }
          },
          {
            id: 'route_captured_url',
            intent: 'system.switch',
            payload: {
              variableKey: 'selected_url',
              routes: [
                {
                  label: 'captured',
                  condition: 'contains',
                  value: 'webhook-test/a',
                  targetStepId: 'hit_captured'
                }
              ],
              defaultStepId: 'hit_default'
            }
          },
          {
            id: 'hit_captured',
            intent: 'system.setVar',
            payload: {
              name: 'capture_result',
              value: 'captured'
            }
          },
          {
            id: 'hit_default',
            intent: 'system.setVar',
            payload: {
              name: 'capture_result',
              value: 'default'
            }
          }
        ]
      };

      const result = await runPipelineFromData(pipeline as any, true);
      assert.strictEqual(result.success, true);
      assert.ok(executedStepIds.includes('hit_captured'), `Expected captured branch. Got: ${executedStepIds.join(', ')}`);
      assert.ok(!executedStepIds.includes('hit_default'), `Default branch should not run. Got: ${executedStepIds.join(', ')}`);
    } finally {
      sub.dispose();
      mockVscode.window.showQuickPick = originalShowQuickPick;
    }
  });

  test('system.form resolves later field options from variables captured earlier in the same form', async () => {
    const originalShowQuickPick = mockVscode.window.showQuickPick;
    const quickPickCalls: any[] = [];
    const executedStepIds: string[] = [];
    const sub = pipelineEventBus.on((event: any) => {
      if (event.type === 'stepStart' && event.stepId) {
        executedStepIds.push(String(event.stepId));
      }
    });

    mockVscode.window.showQuickPick = async (items: any[], options: any) => {
      quickPickCalls.push({ items, options });
      return quickPickCalls.length === 1 ? items[0] : items[1];
    };

    try {
      const pipeline = {
        name: 'dynamic-form-sequential-resolution',
        steps: [
          {
            id: 'set_options',
            intent: 'system.setVar',
            payload: {
              name: 'webhook_options',
              value: '[{\"label\":\"Workflow A [POST]\",\"value\":\"workflow_a\",\"method\":\"POST\",\"testUrl\":\"http://localhost:5678/webhook-test/a\",\"prodUrl\":\"http://localhost:5678/webhook/a\"}]'
            }
          },
          {
            id: 'build_request',
            intent: 'system.form',
            payload: {
              fields: [
                {
                  type: 'select',
                  label: 'Workflow',
                  key: 'selected_workflow',
                  required: true,
                  options: '${var:webhook_options}',
                  captureMap: {
                    selected_method: 'method',
                    selected_test_url: 'testUrl',
                    selected_prod_url: 'prodUrl'
                  }
                },
                {
                  type: 'select',
                  label: 'Endpoint',
                  key: 'request_url',
                  required: true,
                  options: '[{\"label\":\"testUrl\",\"value\":\"${var:selected_test_url}\"},{\"label\":\"prodUrl\",\"value\":\"${var:selected_prod_url}\"}]'
                }
              ]
            }
          },
          {
            id: 'route_request',
            intent: 'system.switch',
            payload: {
              variableKey: 'request_url',
              routes: [
                {
                  label: 'prod',
                  condition: 'contains',
                  value: '/webhook/a',
                  targetStepId: 'hit_prod'
                }
              ],
              defaultStepId: 'hit_default'
            }
          },
          {
            id: 'hit_prod',
            intent: 'system.setVar',
            payload: {
              name: 'request_target',
              value: 'prod'
            }
          },
          {
            id: 'hit_default',
            intent: 'system.setVar',
            payload: {
              name: 'request_target',
              value: 'default'
            }
          }
        ]
      };

      const result = await runPipelineFromData(pipeline as any, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(quickPickCalls.length, 2);
      assert.deepStrictEqual(
        quickPickCalls[1].items.map((item: any) => ({ label: item.label, value: item.value })),
        [
          { label: 'testUrl', value: 'http://localhost:5678/webhook-test/a' },
          { label: 'prodUrl', value: 'http://localhost:5678/webhook/a' }
        ]
      );
      assert.ok(executedStepIds.includes('hit_prod'), `Expected prod branch. Got: ${executedStepIds.join(', ')}`);
      assert.ok(!executedStepIds.includes('hit_default'), `Default branch should not run. Got: ${executedStepIds.join(', ')}`);
    } finally {
      sub.dispose();
      mockVscode.window.showQuickPick = originalShowQuickPick;
    }
  });
});

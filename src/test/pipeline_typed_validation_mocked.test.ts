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
const { registerCapabilities, resetRegistry } = require('../../out/registry');
const { validateStepInput } = require('../../out/pipelineValidator');
Module.prototype.require = originalRequire;

suite('Pipeline Typed Validation (Mocked)', () => {
  const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;

  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
    mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/tmp/leion-test' } }];
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowNetwork', true);
    mockVscode.__mock.configStore.set('intentRouter.runtime.sandbox.allowFileWrite', true);
    resetRegistry();
  });

  teardown(() => {
    mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
  });

  // --- Unit tests for validateStepInput ---

  test('validateStepInput passes when all required fields are present', () => {
    const errors = validateStepInput(
      {
        intent: 'test.action',
        inputSchema: {
          command: { type: 'string', required: true },
          dryRun: { type: 'boolean' }
        }
      },
      { command: 'echo hello', dryRun: false }
    );
    assert.strictEqual(errors.length, 0);
  });

  test('validateStepInput fails when required field is missing', () => {
    const errors = validateStepInput(
      {
        intent: 'test.action',
        inputSchema: {
          command: { type: 'string', required: true }
        }
      },
      {}
    );
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].message.includes('"command"'));
    assert.strictEqual(errors[0].stepIntent, 'test.action');
    assert.strictEqual(errors[0].field, 'command');
  });

  test('validateStepInput fails when required field is empty string', () => {
    const errors = validateStepInput(
      {
        intent: 'test.action',
        inputSchema: { command: { type: 'string', required: true } }
      },
      { command: '' }
    );
    assert.strictEqual(errors.length, 1);
  });

  test('validateStepInput fails on type mismatch', () => {
    const errors = validateStepInput(
      {
        intent: 'test.action',
        inputSchema: { count: { type: 'number' } }
      },
      { count: 'not-a-number' }
    );
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].message.includes('"number"'));
    assert.ok(errors[0].message.includes('"string"'));
  });

  test('validateStepInput ignores optional missing fields', () => {
    const errors = validateStepInput(
      {
        intent: 'test.action',
        inputSchema: { optional: { type: 'string' } }
      },
      {}
    );
    assert.strictEqual(errors.length, 0);
  });

  test('validateStepInput returns no errors when inputSchema is absent', () => {
    const errors = validateStepInput({ intent: 'test.action' }, { anything: 'goes' });
    assert.strictEqual(errors.length, 0);
  });

  // --- Integration test: validation stops pipeline before execution ---

  test('pipeline with failing inputSchema is rejected before execution', async () => {
    let commandWasInvoked = false;
    await mockVscode.commands.registerCommand('intentRouter.test.noop', async () => {
      commandWasInvoked = true;
      return true;
    });
    registerCapabilities({
      provider: 'test',
      type: 'vscode',
      capabilities: [
        {
          capability: 'test.noop',
          command: 'intentRouter.test.noop'
        }
      ]
    });

    const result = await runPipelineFromData(
      {
        name: 'Validation Test Pipeline',
        steps: [
          {
            id: 'step-with-schema',
            intent: 'test.noop',
            inputSchema: {
              requiredField: { type: 'string', required: true }
            },
            payload: {}
          }
        ]
      },
      false
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'failure');
    assert.strictEqual(result.failureReason, 'validation');
    assert.strictEqual(result.failedStepId, 'step-with-schema');
    assert.strictEqual(commandWasInvoked, false, 'Command must not be invoked when validation fails');
  });

  test('pipeline with valid inputSchema executes successfully', async () => {
    await mockVscode.commands.registerCommand('intentRouter.test.noopValid', async () => true);
    registerCapabilities({
      provider: 'test',
      type: 'vscode',
      capabilities: [
        {
          capability: 'test.noopValid',
          command: 'intentRouter.test.noopValid'
        }
      ]
    });

    const result = await runPipelineFromData(
      {
        name: 'Valid Schema Pipeline',
        steps: [
          {
            id: 'step-valid',
            intent: 'test.noopValid',
            inputSchema: {
              command: { type: 'string', required: true }
            },
            payload: { command: 'echo hello' }
          }
        ]
      },
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.failureReason, undefined);
  });
});

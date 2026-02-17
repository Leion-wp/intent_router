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

const { resolveAiCliSpec } = require('../../out/providers/aiAdapter');
Module.prototype.require = originalRequire;

suite('AI Adapter Provider Resolution (Mocked)', () => {
  setup(() => {
    if (mockVscode.__mock?.reset) {
      mockVscode.__mock.reset();
    }
  });

  test('gemini provider uses stdin contract', () => {
    const spec = resolveAiCliSpec('gemini', 'gemini-2.5-flash', 'hello');
    assert.ok(spec.executable.includes('gemini'));
    assert.strictEqual(spec.useStdinPrompt, true);
    assert.ok(spec.args.includes('-m'));
  });

  test('codex provider applies model placeholder and stdin marker', () => {
    mockVscode.__mock.configStore.set('intentRouter.ai.codex.command', 'codex');
    mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', ['exec', '--model', '{model}', '{stdin}']);
    const spec = resolveAiCliSpec('codex', 'gpt-5-codex', 'prompt here');
    assert.strictEqual(spec.executable, 'codex');
    assert.ok(spec.args.includes('gpt-5-codex'));
    assert.strictEqual(spec.useStdinPrompt, true);
  });

  test('codex provider applies prompt placeholder when configured', () => {
    mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', ['exec', '--prompt', '{prompt}']);
    const spec = resolveAiCliSpec('codex', 'gpt-5-codex', 'hello world');
    assert.strictEqual(spec.useStdinPrompt, false);
    assert.ok(spec.args.includes('hello world'));
  });
});

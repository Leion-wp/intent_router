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

const {
  resolveAiCliSpec,
  normalizeAgentRole,
  applyInstructionTemplate,
  normalizeOutputContract,
  resolveAiPromptBudgetConfig,
  truncateForPromptBudget
} = require('../../out/providers/aiAdapter');
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

  test('normalizeAgentRole maps unsupported values to custom', () => {
    assert.strictEqual(normalizeAgentRole('backend'), 'backend');
    assert.strictEqual(normalizeAgentRole('PRD'), 'prd');
    assert.strictEqual(normalizeAgentRole('unknown-role'), 'custom');
  });

  test('applyInstructionTemplate supports placeholder and fallback', () => {
    assert.strictEqual(
      applyInstructionTemplate('SYSTEM\n${instruction}\nEND', 'Do X'),
      'SYSTEM\nDo X\nEND'
    );
    assert.strictEqual(
      applyInstructionTemplate('SYSTEM HEADER', 'Do X'),
      'SYSTEM HEADER\n\nDo X'
    );
  });

  test('normalizeOutputContract keeps supported contracts', () => {
    assert.strictEqual(normalizeOutputContract('path_result'), 'path_result');
    assert.strictEqual(normalizeOutputContract('unified_diff'), 'unified_diff');
    assert.strictEqual(normalizeOutputContract('unknown'), 'path_result');
  });

  test('resolveAiPromptBudgetConfig reads workspace overrides', () => {
    mockVscode.__mock.configStore.set('intentRouter.ai.prompt.maxChars', 64000);
    mockVscode.__mock.configStore.set('intentRouter.ai.context.maxFiles', 3);
    mockVscode.__mock.configStore.set('intentRouter.ai.context.maxFileChars', 4000);
    mockVscode.__mock.configStore.set('intentRouter.ai.spec.maxFiles', 2);
    mockVscode.__mock.configStore.set('intentRouter.ai.spec.maxFileChars', 1500);
    const config = resolveAiPromptBudgetConfig();
    assert.strictEqual(config.maxPromptChars, 64000);
    assert.strictEqual(config.maxContextFiles, 3);
    assert.strictEqual(config.maxContextFileChars, 4000);
    assert.strictEqual(config.maxSpecFiles, 2);
    assert.strictEqual(config.maxSpecFileChars, 1500);
  });

  test('truncateForPromptBudget appends notice when text is trimmed', () => {
    const truncated = truncateForPromptBudget('abcdefghijklmnopqrstuvwxyz', 14, '[cut]');
    assert.ok(truncated.includes('[cut]'));
    assert.ok(truncated.length <= 14);
  });
});

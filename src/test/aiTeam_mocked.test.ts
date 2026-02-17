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

const { normalizeTeamStrategy, normalizeTeamMembers } = require('../../out/providers/aiAdapter');
Module.prototype.require = originalRequire;

suite('AI Team Helpers (Mocked)', () => {
  test('normalizeTeamStrategy defaults to sequential', () => {
    assert.strictEqual(normalizeTeamStrategy(undefined), 'sequential');
    assert.strictEqual(normalizeTeamStrategy('unknown'), 'sequential');
    assert.strictEqual(normalizeTeamStrategy('reviewer_gate'), 'reviewer_gate');
    assert.strictEqual(normalizeTeamStrategy('vote'), 'vote');
  });

  test('normalizeTeamMembers keeps only members with instruction', () => {
    const members = normalizeTeamMembers([
      { name: 'a', agent: 'gemini', instruction: 'do A' },
      { name: 'b', agent: 'codex', instruction: '' },
      { name: 'c', instruction: 'do C', contextFiles: ['src/**/*.ts'] }
    ]);

    assert.strictEqual(members.length, 2);
    assert.strictEqual(members[0].name, 'a');
    assert.strictEqual(members[1].name, 'c');
    assert.deepStrictEqual(members[1].contextFiles, ['src/**/*.ts']);
  });
});

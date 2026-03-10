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

const { normalizeTeamStrategy, normalizeTeamMembers, resolveTeamStrategyResult, pickTeamResultByVote, pickTeamResultByWeightedVote, resolveSessionMemoryPolicy, resolveReviewerVoteWeight } = require('../../out/providers/aiAdapter');
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

  test('reviewer_gate returns reviewer result', () => {
    const result = resolveTeamStrategyResult('reviewer_gate', [
      { member: { name: 'writer', role: 'writer' }, result: { path: 'a', changes: [{ path: 'a', content: '1' }] } },
      { member: { name: 'reviewer', role: 'reviewer' }, result: { path: 'a', changes: [{ path: 'a', content: '2' }] } }
    ]);
    assert.strictEqual(result.changes[0].content, '2');
  });

  test('vote picks most common changes', () => {
    const winner = pickTeamResultByVote([
      { path: 'a', changes: [{ path: 'a', content: 'x' }] },
      { path: 'a', changes: [{ path: 'a', content: 'x' }] },
      { path: 'a', changes: [{ path: 'a', content: 'y' }] }
    ]);
    assert.strictEqual(winner.changes[0].content, 'x');
  });

  test('reviewer_gate throws without reviewer', () => {
    assert.throws(() => resolveTeamStrategyResult('reviewer_gate', [
      { member: { name: 'writer-1', role: 'writer' }, result: { path: 'a', changes: [] } }
    ]), /requires at least one member with role=\"reviewer\"/i);
  });

  test('weighted vote favors reviewer when configured', () => {
    const vote = pickTeamResultByWeightedVote([
      { member: { name: 'writerA', role: 'writer' }, result: { path: 'a', changes: [{ path: 'a', content: 'x' }] } },
      { member: { name: 'writerB', role: 'writer' }, result: { path: 'a', changes: [{ path: 'a', content: 'y' }] } },
      { member: { name: 'reviewer', role: 'reviewer' }, result: { path: 'a', changes: [{ path: 'a', content: 'y' }] } }
    ], 3);

    assert.ok(vote);
    assert.strictEqual(vote.result.changes[0].content, 'y');
    assert.strictEqual(vote.winnerMember, 'writerB');
    assert.ok(String(vote.winnerReason).includes('reviewer weight=3'));
  });

  test('session memory policy resolves mode flags', () => {
    assert.deepStrictEqual(resolveSessionMemoryPolicy('runtime_only'), { mode: 'runtime_only', read: false, write: false });
    assert.deepStrictEqual(resolveSessionMemoryPolicy('read_only'), { mode: 'read_only', read: true, write: false });
    assert.deepStrictEqual(resolveSessionMemoryPolicy('write_only'), { mode: 'write_only', read: false, write: true });
    assert.deepStrictEqual(resolveSessionMemoryPolicy('read_write'), { mode: 'read_write', read: true, write: true });
    assert.deepStrictEqual(resolveSessionMemoryPolicy('invalid'), { mode: 'read_write', read: true, write: true });
  });

  test('reviewer vote weight accepts explicit override', () => {
    assert.strictEqual(resolveReviewerVoteWeight(5), 5);
    assert.strictEqual(resolveReviewerVoteWeight('3'), 3);
    assert.strictEqual(resolveReviewerVoteWeight('0'), 1);
  });
});

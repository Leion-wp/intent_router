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

const { parseProposedChangesStrict } = require('../../out/providers/aiAdapter');
Module.prototype.require = originalRequire;

suite('AI Adapter Contract Parsing (Mocked)', () => {
  test('parses single PATH/RESULT pair', () => {
    const output = `
[PATH]src/a.txt[/PATH]
[RESULT]\`\`\`txt
hello
\`\`\`[/RESULT]
`.trim();
    const changes = parseProposedChangesStrict(output);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].path, 'src/a.txt');
    assert.strictEqual(changes[0].content, 'hello');
  });

  test('parses multiple PATH/RESULT pairs', () => {
    const output = `
[PATH]src/a.txt[/PATH]
[RESULT]\`\`\`txt
hello
\`\`\`[/RESULT]
[PATH]src/b.txt[/PATH]
[RESULT]\`\`\`txt
world
\`\`\`[/RESULT]
`.trim();
    const changes = parseProposedChangesStrict(output);
    assert.strictEqual(changes.length, 2);
    assert.strictEqual(changes[1].path, 'src/b.txt');
    assert.strictEqual(changes[1].content, 'world');
  });

  test('rejects text before first block', () => {
    const output = `
I will now provide changes.
[PATH]src/a.txt[/PATH]
[RESULT]\`\`\`txt
hello
\`\`\`[/RESULT]
`.trim();
    assert.throws(() => parseProposedChangesStrict(output), /outside \[PATH\]\/\[RESULT\] blocks/i);
  });

  test('rejects text after last block', () => {
    const output = `
[PATH]src/a.txt[/PATH]
[RESULT]\`\`\`txt
hello
\`\`\`[/RESULT]
Thanks!
`.trim();
    assert.throws(() => parseProposedChangesStrict(output), /outside \[PATH\]\/\[RESULT\] blocks/i);
  });

  test('returns empty for no blocks', () => {
    const output = 'no valid blocks here';
    const changes = parseProposedChangesStrict(output);
    assert.deepStrictEqual(changes, []);
  });
});

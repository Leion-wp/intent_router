const path = require('path');
const fs = require('fs');

require('ts-node').register({
  transpileOnly: true,
  project: path.join(__dirname, '..', 'webview-ui', 'tsconfig.node-tests.json')
});

function collectTests(dirPath) {
  const out = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTests(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      out.push(fullPath);
    }
  }
  return out;
}

const testsRoot = path.join(__dirname, '..', 'webview-ui', 'src', 'test', 'state');
const tests = collectTests(testsRoot).sort((a, b) => a.localeCompare(b));

let failed = false;

for (const filePath of tests) {
  const label = path.basename(filePath);
  try {
    const mod = require(filePath);
    if (typeof mod.run !== 'function') {
      throw new Error(`Missing run() export in ${label}`);
    }
    mod.run();
    process.stdout.write(`[UI state test] OK: ${label}\n`);
  } catch (error) {
    failed = true;
    process.stderr.write(`[UI state test] FAILED: ${label}\n`);
    process.stderr.write(`${error?.stack || error}\n`);
  }
}

if (failed) {
  process.exit(1);
}

process.stdout.write('[UI state test] All tests passed.\n');

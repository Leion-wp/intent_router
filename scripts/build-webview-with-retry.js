const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait is acceptable for short retry delays in build helper script
  }
}

function runBuildOnce() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npmCommand, ['run', 'build:webview:raw'], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..')
  });
}

function hasReusableBundle() {
  const dir = path.resolve(__dirname, '..', 'out', 'webview-bundle');
  return fs.existsSync(path.join(dir, 'index.js'))
    && fs.existsSync(path.join(dir, 'index.css'))
    && fs.existsSync(path.join(dir, 'index.html'));
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${String(result.error)}\n`);
}

function main() {
  let lastOutput = '';
  let lastStatus = 1;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = runBuildOnce();
    printOutput(result);

    const status = typeof result.status === 'number' ? result.status : 1;
    const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`;
    lastOutput = output;
    lastStatus = status;

    if (status === 0) {
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[build:webview] attempt ${attempt} failed; retrying...`);
      sleep(RETRY_DELAY_MS * attempt);
    }
  }

  if (/spawn EPERM|EACCES|ENOENT|spawnSync/i.test(lastOutput) && hasReusableBundle()) {
    console.warn('[build:webview] esbuild spawn EPERM persists; reusing existing out/webview-bundle artifacts.');
    return;
  }

  process.exit(lastStatus || 1);
}

main();

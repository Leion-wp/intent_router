const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;
const ROOT_DIR = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT_DIR, 'out', 'webview-bundle');
const WEBVIEW_DIR = path.join(ROOT_DIR, 'webview-ui');
const VITE_CLI_PATH = path.join(WEBVIEW_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
const REQUIRED_BUNDLE_FILES = ['index.js', 'index.css', 'index.html'];
const WEBVIEW_INPUTS = [
  path.join(ROOT_DIR, 'webview-ui', 'index.html'),
  path.join(ROOT_DIR, 'webview-ui', 'package.json'),
  path.join(ROOT_DIR, 'webview-ui', 'tsconfig.json'),
  path.join(ROOT_DIR, 'webview-ui', 'vite.config.ts'),
  path.join(ROOT_DIR, 'webview-ui', 'src')
];

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait is acceptable for short retry delays in build helper script
  }
}

function resolveBuildInvocation() {
  if (fs.existsSync(VITE_CLI_PATH)) {
    return {
      command: process.execPath,
      args: [VITE_CLI_PATH, 'build'],
      cwd: WEBVIEW_DIR
    };
  }

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, 'run', 'build:webview:raw'],
      cwd: ROOT_DIR
    };
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'build:webview:raw'],
    cwd: ROOT_DIR
  };
}

function runBuildOnce() {
  const invocation = resolveBuildInvocation();
  return spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    cwd: invocation.cwd
  });
}

function getExistingBundleFiles() {
  return REQUIRED_BUNDLE_FILES
    .map((file) => path.join(BUNDLE_DIR, file))
    .filter((filePath) => fs.existsSync(filePath));
}

function hasReusableBundle() {
  return getExistingBundleFiles().length === REQUIRED_BUNDLE_FILES.length;
}

function getOldestBundleMtimeMs() {
  const bundleFiles = getExistingBundleFiles();
  if (bundleFiles.length !== REQUIRED_BUNDLE_FILES.length) {
    return 0;
  }
  return bundleFiles.reduce((oldest, filePath) => {
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    return oldest === 0 ? mtimeMs : Math.min(oldest, mtimeMs);
  }, 0);
}

function getNewestInputMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  return fs.readdirSync(targetPath, { withFileTypes: true }).reduce((latest, entry) => {
    const entryPath = path.join(targetPath, entry.name);
    const entryMtimeMs = getNewestInputMtimeMs(entryPath);
    return Math.max(latest, entryMtimeMs);
  }, stat.mtimeMs);
}

function isBundleFreshEnough() {
  const oldestBundleMtimeMs = getOldestBundleMtimeMs();
  if (!oldestBundleMtimeMs) {
    return false;
  }

  const newestInputMtimeMs = WEBVIEW_INPUTS.reduce((latest, inputPath) => {
    return Math.max(latest, getNewestInputMtimeMs(inputPath));
  }, 0);

  return oldestBundleMtimeMs >= newestInputMtimeMs;
}

function isTransientSpawnFailure(output) {
  return /(spawn\s+eperm|spawnsync\s+eperm|eperm|eacces|ebusy)/i.test(output);
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

  if (isTransientSpawnFailure(lastOutput) && hasReusableBundle() && isBundleFreshEnough()) {
    console.warn('[build:webview] transient spawn error persists; reusing fresh out/webview-bundle artifacts.');
    return;
  }

  if (hasReusableBundle() && !isBundleFreshEnough()) {
    console.error('[build:webview] existing out/webview-bundle artifacts are stale; refusing fallback.');
  }

  process.exit(lastStatus || 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  resolveBuildInvocation,
  hasReusableBundle,
  isBundleFreshEnough,
  isTransientSpawnFailure
};

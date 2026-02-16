const { spawnSync } = require('child_process');

const steps = [
  { name: 'TypeScript (webview-ui)', command: 'npm', args: ['--prefix', 'webview-ui', 'exec', 'tsc', '--noEmit', '--pretty', 'false'] },
  { name: 'UI state tests', command: 'npm', args: ['run', 'test:webview-state'] },
  { name: 'Compile extension', command: 'npm', args: ['run', 'compile'] },
  { name: 'Extension tests', command: 'npm', args: ['test'] }
];

let failed = false;

for (const step of steps) {
  process.stdout.write(`\n[PR15 Gate] ${step.name}...\n`);
  const result = spawnSync(step.command, step.args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`[PR15 Gate] FAILED: ${step.name}\n`);
    break;
  }
  process.stdout.write(`[PR15 Gate] OK: ${step.name}\n`);
}

if (failed) {
  process.exit(1);
}

process.stdout.write('\n[PR15 Gate] All checks passed.\n');

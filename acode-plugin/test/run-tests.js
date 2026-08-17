const fs = require('fs');
const path = require('path');

async function runAllTests() {
  console.log('=== Running Acode Runtime Test Suite ===\n');

  const testDir = __dirname;
  const files = fs.readdirSync(testDir);
  const testFiles = files.filter(f => f.startsWith('test_') && f.endsWith('.js'));

  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  const startTime = Date.now();

  for (const file of testFiles) {
    const testPath = path.join(testDir, file);
    console.log(`Running suite: ${file}...`);
    try {
      const suite = require(testPath);
      if (typeof suite === 'function') {
        await suite();
      } else if (suite && typeof suite.run === 'function') {
        await suite.run();
      }
      console.log(`  ✓ ${file} passed`);
      totalPassed++;
    } catch (err) {
      console.error(`  ✗ ${file} failed: ${err.message}`);
      if (err.stack) console.error(err.stack);
      totalFailed++;
      failures.push({ file, error: err });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n========================================`);
  console.log(`Acode Test Suite Results: ${totalPassed} passed, ${totalFailed} failed (${duration}s)`);
  console.log(`========================================\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests };

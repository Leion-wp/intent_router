const fs = require('fs');
const path = require('path');

function discoverTestFiles(files) {
  const testFiles = files.filter(f => f.startsWith('test_') && f.endsWith('.js'));
  if (testFiles.length === 0) {
    const error = new Error('no_test_suites_discovered');
    error.code = 'no_test_suites_discovered';
    throw error;
  }
  return testFiles;
}

function resolveSuiteRunner(suite, file = '<unknown>') {
  if (typeof suite === 'function') {
    return suite;
  }

  if (suite && typeof suite.run === 'function') {
    return () => suite.run();
  }

  const error = new Error(`invalid_test_suite_export:${file}`);
  error.code = 'invalid_test_suite_export';
  throw error;
}

async function runAllTests() {
  console.log('=== Running Acode Runtime Test Suite ===\n');

  const testDir = __dirname;
  const files = fs.readdirSync(testDir);
  const testFiles = discoverTestFiles(files);

  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  const startTime = Date.now();

  for (const file of testFiles) {
    const testPath = path.join(testDir, file);
    console.log(`Running suite: ${file}...`);
    try {
      const suite = require(testPath);
      const runSuite = resolveSuiteRunner(suite, file);
      await runSuite();
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

module.exports = { runAllTests, discoverTestFiles, resolveSuiteRunner };

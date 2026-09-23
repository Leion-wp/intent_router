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

module.exports = { discoverTestFiles, resolveSuiteRunner };

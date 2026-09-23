const assert = require('assert');
const { discoverTestFiles, resolveSuiteRunner } = require('./runner-contract');

module.exports = async function testRunnerContract() {
  const functionSuite = async () => {};
  assert.strictEqual(resolveSuiteRunner(functionSuite, 'function-suite.js'), functionSuite);

  let objectSuiteRan = false;
  const objectSuite = {
    async run() {
      objectSuiteRan = true;
    },
  };
  await resolveSuiteRunner(objectSuite, 'object-suite.js')();
  assert.strictEqual(objectSuiteRan, true, 'object run() suites must execute');

  assert.throws(
    () => resolveSuiteRunner({}, 'invalid-suite.js'),
    (error) => error && error.code === 'invalid_test_suite_export' && error.message === 'invalid_test_suite_export:invalid-suite.js',
    'discovered modules with unsupported exports must fail closed',
  );

  assert.throws(
    () => discoverTestFiles(['harness.js', 'README.md']),
    (error) => error && error.code === 'no_test_suites_discovered',
    'an empty discovered-suite set must fail closed',
  );

  assert.deepStrictEqual(
    discoverTestFiles(['test_b.js', 'harness.js', 'test_a.js', 'notes.txt']),
    ['test_b.js', 'test_a.js'],
    'valid discovered suites must be preserved',
  );
};

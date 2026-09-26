import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, makeDiagnosis } from './classify.mjs';
import { MAX_REPAIR_ATTEMPTS, fingerprint, nextTransition } from './orchestrate.mjs';

test('classifies reference incident failures', () => {
  assert.equal(classifyFailure('Invalid environment variables'), 'ENV_VALIDATION');
  assert.equal(classifyFailure('promise resolved instead of rejecting'), 'TEST_HARNESS_INVALID');
  assert.equal(classifyFailure('Neither apiKey nor config.authenticator provided'), 'RUNTIME_INIT');
  assert.equal(classifyFailure('Missing API key. Pass it to new Resend'), 'RUNTIME_INIT');
});

test('routes ordinary known failures to same-session rework', () => {
  const diagnosis = makeDiagnosis({ log: 'Missing API key', culprit: 'src/lib/email/index.ts', head: 'abc' });
  assert.equal(nextTransition({ diagnosis, attempts: 1 }), 'SAME_SESSION_REWORK');
});

test('stops repeated same-head failure loops', () => {
  const diagnosis = makeDiagnosis({ log: 'Missing API key', culprit: 'src/lib/email/index.ts', head: 'abc' });
  assert.equal(nextTransition({ diagnosis, attempts: 1, repeated: true }), 'NO_RETRY');
  assert.equal(fingerprint({ head: 'abc', failureClass: diagnosis.class, culprit: diagnosis.culprit }), 'abc:RUNTIME_INIT:src/lib/email/index.ts');
});

test('escalates protected changes and exhausted budgets', () => {
  const protectedDiagnosis = makeDiagnosis({ log: 'build error', culprit: '.github/workflows/quality.yml', head: 'abc' });
  assert.equal(nextTransition({ diagnosis: protectedDiagnosis }), 'HUMAN_REQUIRED');
  const ordinary = makeDiagnosis({ log: 'build error', culprit: 'src/app/page.tsx', head: 'abc' });
  assert.equal(nextTransition({ diagnosis: ordinary, attempts: MAX_REPAIR_ATTEMPTS }), 'HUMAN_REQUIRED');
});

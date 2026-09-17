const rules = [
  ['ENV_VALIDATION', /invalid environment variables|missing environment|environment validation/i],
  ['RUNTIME_INIT', /neither apiKey nor config\.authenticator|missing api key|failed to collect (?:configuration|page data)/i],
  ['TEST_HARNESS_INVALID', /instead of rejecting|mock|fixture/i],
  ['INSTALL', /pnpm install|ERR_PNPM|lockfile/i],
  ['LINT', /eslint|pnpm lint/i],
  ['TYPECHECK', /tsc|typecheck|typescript error/i],
  ['TEST', /vitest|failed tests|pnpm test/i],
  ['BUILD', /next build|build error occurred|pnpm build/i],
];

export function classifyFailure(log = '') {
  for (const [failureClass, pattern] of rules) {
    if (pattern.test(log)) return failureClass;
  }
  return 'UNKNOWN';
}

export function makeDiagnosis({ log = '', culprit = null, head = null } = {}) {
  const failureClass = classifyFailure(log);
  const protectedChange = /\.github\/workflows|secret|branch protection|permission/i.test(culprit || '');
  return {
    version: 1,
    head,
    class: failureClass,
    culprit,
    retryable: failureClass !== 'UNKNOWN' && !protectedChange,
    requires_human: protectedChange || failureClass === 'UNKNOWN',
  };
}

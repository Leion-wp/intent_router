export const MAX_REPAIR_ATTEMPTS = 4;

export function nextTransition({ diagnosis, attempts = 0, repeated = false } = {}) {
  if (!diagnosis) return 'HUMAN_REQUIRED';
  if (diagnosis.requires_human) return 'HUMAN_REQUIRED';
  if (repeated) return 'NO_RETRY';
  if (attempts >= MAX_REPAIR_ATTEMPTS) return 'HUMAN_REQUIRED';
  if (!diagnosis.retryable) return 'HUMAN_REQUIRED';
  return 'SAME_SESSION_REWORK';
}

export function fingerprint({ head, failureClass, culprit }) {
  return [head || 'no-head', failureClass || 'UNKNOWN', culprit || 'unknown'].join(':');
}

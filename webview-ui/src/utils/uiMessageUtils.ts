export type UiMessageLevel = 'error' | 'warn' | 'info';

type FormatUiMessageOptions = {
  context?: string;
  action?: string;
  fallback?: string;
};

function normalizeMessageText(input: unknown, fallback: string): string {
  const text = String(input ?? '').trim();
  if (!text) return fallback;
  return text.replace(/^(error|warning|warn|info)\s*:\s*/i, '').trim();
}

export function formatUiMessage(
  level: UiMessageLevel,
  input: unknown,
  options: FormatUiMessageOptions = {}
): string {
  const fallback = options.fallback || 'Unexpected issue.';
  const context = String(options.context || '').trim();
  const action = String(options.action || '').trim();
  const base = normalizeMessageText(input, fallback);
  const prefix = level === 'error' ? 'Error' : level === 'warn' ? 'Warning' : 'Info';
  const withContext = context ? `${context}: ${base}` : base;
  return action ? `${prefix}: ${withContext} — ${action}` : `${prefix}: ${withContext}`;
}

export function formatUiError(input: unknown, options: Omit<FormatUiMessageOptions, 'fallback'> & { fallback?: string } = {}): string {
  return formatUiMessage('error', input, {
    fallback: options.fallback || 'Action failed.',
    context: options.context,
    action: options.action
  });
}

export function formatUiWarning(input: unknown, options: Omit<FormatUiMessageOptions, 'fallback'> & { fallback?: string } = {}): string {
  return formatUiMessage('warn', input, {
    fallback: options.fallback || 'Check your input and retry.',
    context: options.context,
    action: options.action
  });
}

export function formatUiInfo(input: unknown, options: Omit<FormatUiMessageOptions, 'fallback'> & { fallback?: string } = {}): string {
  return formatUiMessage('info', input, {
    fallback: options.fallback || 'Operation completed.',
    context: options.context,
    action: options.action
  });
}

export function canonicalizeIntent(provider: string, capability: string): { provider: string; intent: string; capability: string } {
  const fallbackProvider = (provider || '').trim() || 'terminal';
  let cap = (capability || '').trim();

  if (!cap) {
    const intent = `${fallbackProvider}.run`;
    return { provider: fallbackProvider, intent, capability: intent };
  }

  const inferredProvider = cap.includes('.') ? cap.split('.')[0] : fallbackProvider;
  const finalProvider = (inferredProvider || '').trim() || fallbackProvider;

  if (!cap.includes('.')) {
    cap = `${finalProvider}.${cap}`;
  }

  const dupPrefix = `${finalProvider}.${finalProvider}.`;
  while (cap.startsWith(dupPrefix)) {
    cap = `${finalProvider}.` + cap.slice(dupPrefix.length);
  }

  return { provider: finalProvider, intent: cap, capability: cap };
}

export function inferScriptInterpreter(scriptPath: string): string {
  const lower = String(scriptPath || '').trim().toLowerCase();
  if (lower.endsWith('.ps1')) return 'pwsh -File';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.js')) return 'node';
  if (lower.endsWith('.sh')) return 'bash';
  return '';
}

export function quoteShell(value: string): string {
  const input = String(value || '');
  if (!input) return '""';
  if (!/[\s"]/g.test(input)) return input;
  return `"${input.replace(/"/g, '\\"')}"`;
}

export function buildScriptCommand(scriptPath: string, args: string, interpreter?: string): string {
  const script = String(scriptPath || '').trim();
  const argsString = String(args || '').trim();
  const runtimeOverride = String(interpreter || '').trim();
  const runtime = runtimeOverride || inferScriptInterpreter(script);
  const lower = script.toLowerCase();

  if (!runtimeOverride && lower.endsWith('.ps1')) {
    const baseArg = `${quoteShell(script)}${argsString ? ` ${argsString}` : ''}`;
    return `if (Get-Command pwsh -ErrorAction SilentlyContinue) { pwsh -File ${baseArg} } else { powershell -File ${baseArg} }`;
  }

  const prefix = runtime ? `${runtime} ` : '';
  const base = `${prefix}${quoteShell(script)}`;
  return argsString ? `${base} ${argsString}` : base;
}

export function isRequiredValueMissing(value: any, type: string): boolean {
  if (type === 'boolean') {
    return value === undefined || value === null;
  }
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

export function firstMissingRequiredField(fields: any[], args: Record<string, any>): string | null {
  for (const field of fields || []) {
    if (!field?.required) continue;
    const name = String(field?.name || '').trim();
    if (!name) continue;
    const type = String(field?.type || 'string').trim();
    if (isRequiredValueMissing(args?.[name], type)) {
      return name;
    }
  }
  return null;
}

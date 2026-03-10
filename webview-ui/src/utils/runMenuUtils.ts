export type RunPillStatus = 'idle' | 'running' | 'success' | 'error';

export function getRunPillBackground(status: RunPillStatus): string {
  if (status === 'running') return 'var(--ir-run-running)';
  if (status === 'success') return 'var(--ir-run-success)';
  if (status === 'error') return 'var(--ir-run-error)';
  return 'var(--ir-run-idle)';
}

export function canRunFromSelection(selectedNodeId: string | null): boolean {
  return typeof selectedNodeId === 'string' && selectedNodeId.trim().length > 0;
}

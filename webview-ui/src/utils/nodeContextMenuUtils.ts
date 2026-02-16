export function isStartNodeId(nodeId: string | null | undefined): boolean {
  return String(nodeId || '').trim() === 'start';
}

export function canRunFromContextNode(nodeId: string | null | undefined): boolean {
  return !isStartNodeId(nodeId);
}

export function canDeleteContextNode(nodeId: string | null | undefined): boolean {
  return !isStartNodeId(nodeId);
}

export function canToggleCollapseContextNode(nodeId: string | null | undefined): boolean {
  return !isStartNodeId(nodeId);
}

export function canDisconnectContextNode(nodeId: string | null | undefined): boolean {
  return !isStartNodeId(nodeId);
}

export type FlowNodeRuntimeStatus = 'idle' | 'running' | 'success' | 'error';

export function normalizeExecutionStatus(raw: unknown): FlowNodeRuntimeStatus {
  const value = String(raw || '').toLowerCase();
  if (value === 'running') return 'running';
  if (value === 'success') return 'success';
  if (value === 'failure' || value === 'error') return 'error';
  return 'idle';
}

export function computeNextRunPillStatus(
  previous: FlowNodeRuntimeStatus,
  incoming: FlowNodeRuntimeStatus
): FlowNodeRuntimeStatus {
  if (incoming === 'running') return 'running';
  if (incoming === 'error') return 'error';
  if (incoming === 'success') return previous === 'error' ? previous : 'success';
  return previous;
}

export function applyExecutionStatusToNodes(
  nodes: any[],
  options: {
    status: FlowNodeRuntimeStatus;
    intentId?: string;
    stepId?: string;
    index?: number;
  }
): any[] {
  const status = normalizeExecutionStatus(options.status);
  const stepId = String(options.stepId || '').trim();
  const hasIndex = typeof options.index === 'number' && Number.isFinite(options.index);

  const applyStatus = (node: any) => ({
    ...node,
    data: {
      ...node.data,
      status,
      intentId: options.intentId,
      logs: status === 'running' ? [] : (node.data as any).logs
    }
  });

  if (stepId) {
    let matched = false;
    const byStepId = nodes.map((node) => {
      if (String(node.id) === stepId) {
        matched = true;
        return applyStatus(node);
      }
      return node;
    });
    if (matched) {
      return byStepId;
    }
  }

  if (hasIndex) {
    const actionNodes = nodes.filter((node: any) => node.id !== 'start');
    const targetNode = actionNodes[options.index as number];
    if (!targetNode) return nodes;
    return nodes.map((node: any) => (node.id === targetNode.id ? applyStatus(node) : node));
  }

  return nodes;
}

export function applyStepLogToNodes(
  nodes: any[],
  options: {
    stepId?: string;
    intentId?: string;
    text?: unknown;
    stream?: string;
  },
  maxLogLines: number
): any[] {
  return nodes.map((node) => {
    const matchesNode = options.stepId ? node.id === options.stepId : node.data.intentId === options.intentId;
    if (!matchesNode) return node;

    const currentLogs = (node.data.logs as Array<any>) || [];
    const rawText = typeof options.text === 'string' ? options.text : String(options.text ?? '');
    const incomingLines = rawText.split(/\r?\n/).filter((line: string) => line.length > 0);
    const nextLogs = [
      ...currentLogs,
      ...incomingLines.map((line: string) => ({ text: line, stream: options.stream }))
    ];
    const trimmed = nextLogs.length > maxLogLines ? nextLogs.slice(-maxLogLines) : nextLogs;
    return {
      ...node,
      data: {
        ...node.data,
        logs: trimmed
      }
    };
  });
}

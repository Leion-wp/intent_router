import { Edge } from '@xyflow/react';

type NodeBuilderOptions = {
  customNodesById: Map<string, any>;
  getDefaultCapability: (provider: string) => string;
};

function buildCustomNodeData(customNodeId: string, customNodesById: Map<string, any>) {
  const normalizedId = String(customNodeId || '').trim();
  const definition = normalizedId ? customNodesById.get(normalizedId) : undefined;
  return {
    customNodeId: normalizedId,
    title: definition?.title || '',
    intent: definition?.intent || '',
    schema: definition?.schema || [],
    mapping: definition?.mapping,
    args: {},
    status: 'idle',
    kind: 'custom'
  };
}

export function buildQuickAddNodeData(item: any, options: NodeBuilderOptions): any {
  const { customNodesById, getDefaultCapability } = options;
  const data: any = { status: 'idle' };

  if (item.nodeType === 'actionNode') {
    data.provider = item.provider || 'terminal';
    data.capability = item.capability || getDefaultCapability(item.provider || 'terminal');
    data.args = {};
  } else if (item.nodeType === 'customNode') {
    return buildCustomNodeData(String(item.customNodeId || ''), customNodesById);
  } else if (item.nodeType === 'formNode') {
    data.fields = [];
    data.kind = 'form';
  } else if (item.nodeType === 'switchNode') {
    data.label = 'Switch';
    data.variableKey = '';
    data.routes = [];
    data.kind = 'switch';
  } else if (item.nodeType === 'scriptNode') {
    data.scriptPath = '';
    data.args = '';
    data.cwd = '';
    data.interpreter = '';
    data.kind = 'script';
  } else if (item.nodeType === 'promptNode') {
    data.name = '';
    data.value = '';
    data.kind = 'prompt';
  } else if (item.nodeType === 'repoNode') {
    data.path = '';
    data.kind = 'repo';
  } else if (item.nodeType === 'vscodeCommandNode') {
    data.commandId = '';
    data.argsJson = '';
  }

  return data;
}

export function buildDropNodeData(
  options: {
    type: string;
    provider: string;
    customNodeId: string;
  },
  deps: {
    customNodesById: Map<string, any>;
  }
): any {
  const { type, provider, customNodeId } = options;
  const { customNodesById } = deps;
  if (type === 'actionNode') {
    return { provider, capability: '', args: {}, status: 'idle', kind: 'action' };
  }
  if (type === 'customNode') {
    return buildCustomNodeData(customNodeId, customNodesById);
  }
  if (type === 'formNode') {
    return { fields: [], status: 'idle', kind: 'form' };
  }
  if (type === 'switchNode') {
    return { label: 'Switch', variableKey: '', routes: [], status: 'idle', kind: 'switch' };
  }
  if (type === 'scriptNode') {
    return { scriptPath: '', args: '', cwd: '', interpreter: '', status: 'idle', kind: 'script' };
  }
  if (type === 'promptNode') {
    return { name: '', value: '', kind: 'prompt' };
  }
  if (type === 'repoNode') {
    return { path: '${workspaceRoot}', kind: 'repo' };
  }
  if (type === 'vscodeCommandNode') {
    return { commandId: '', argsJson: '', kind: 'vscodeCommand' };
  }
  return { status: 'idle' };
}

export function computeEdgeMidpointPosition(sourceNode: any, targetNode: any): { x: number; y: number } | null {
  if (!sourceNode || !targetNode) return null;
  const sx = (sourceNode.positionAbsolute?.x ?? sourceNode.position.x) + (sourceNode.width || 0) / 2;
  const sy = (sourceNode.positionAbsolute?.y ?? sourceNode.position.y) + (sourceNode.height || 0) / 2;
  const tx = (targetNode.positionAbsolute?.x ?? targetNode.position.x) + (targetNode.width || 0) / 2;
  const ty = (targetNode.positionAbsolute?.y ?? targetNode.position.y) + (targetNode.height || 0) / 2;
  return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
}

export function buildSplitInsertEdges(edge: Edge, insertedNodeId: string) {
  const now = Date.now();
  const first: any = {
    id: `e-${edge.source}-${insertedNodeId}-${now}`,
    source: edge.source,
    target: insertedNodeId,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    markerEnd: edge.markerEnd,
    style: edge.style,
    animated: edge.animated,
    type: 'insertable'
  };
  const second: any = {
    id: `e-${insertedNodeId}-${edge.target}-${now + 1}`,
    source: insertedNodeId,
    target: edge.target,
    markerEnd: edge.markerEnd,
    style: edge.style,
    animated: edge.animated,
    type: 'insertable'
  };
  return { first, second };
}

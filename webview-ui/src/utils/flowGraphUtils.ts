export function buildGraphAdjacency(effectiveNodes: any[], effectiveEdges: any[]) {
  const nodeMap = new Map(effectiveNodes.map((node) => [node.id, node]));
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const failureMap = new Map<string, string>();
  const successEdgePref = new Map<string, string>();

  effectiveNodes.forEach((node) => {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  effectiveEdges.forEach((edge) => {
    if (adj.has(edge.source) && adj.has(edge.target)) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    if (edge.sourceHandle === 'failure') {
      failureMap.set(edge.source, edge.target);
    } else {
      successEdgePref.set(edge.source, edge.target);
    }
  });

  return { nodeMap, adj, inDegree, failureMap, successEdgePref };
}

export function validateDisconnectedNodes(
  effectiveNodes: any[],
  adj: Map<string, string[]>,
  inDegree: Map<string, number>
): string | null {
  if (effectiveNodes.length <= 1) {
    return null;
  }

  const hasStart = effectiveNodes.some((node: any) => node?.id === 'start');
  const hasExecutable = effectiveNodes.some((node: any) => node?.type !== 'startNode' && node?.type !== 'input');
  if (hasStart && hasExecutable && (adj.get('start')?.length || 0) === 0) {
    return 'Start node must be connected.';
  }

  const isolated = effectiveNodes.find(
    (node: any) => node.type !== 'startNode' && node.type !== 'input' && (inDegree.get(node.id) === 0) && (adj.get(node.id)?.length === 0)
  );
  if (isolated) {
    return `Node '${(isolated as any).data?.label || isolated.type}' is not connected.`;
  }

  return null;
}

export function topologicalSortWithSuccessPreference(
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
  successEdgePref: Map<string, string>
): string[] {
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedIds: string[] = [];
  let lastProcessedId: string | null = null;

  while (queue.length > 0) {
    let index = 0;
    if (lastProcessedId && successEdgePref.has(lastProcessedId)) {
      const preferredNext = successEdgePref.get(lastProcessedId)!;
      const preferredIndex = queue.indexOf(preferredNext);
      if (preferredIndex !== -1) {
        index = preferredIndex;
      }
    }

    const current = queue.splice(index, 1)[0];
    sortedIds.push(current);
    lastProcessedId = current;

    const neighbors = adj.get(current) || [];
    neighbors.forEach((neighbor) => {
      inDegree.set(neighbor, (inDegree.get(neighbor)! - 1));
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  return sortedIds;
}

export function buildPipelineUiSnapshot(nodes: any[], edges: any[]) {
  return {
    nodes: nodes.map((node: any) => {
      const { status, logs, intentId, ...rest } = (node.data || {}) as any;
      return {
        ...node,
        data: { ...rest, status: 'idle' }
      };
    }),
    edges: edges.map((edge: any) => {
      const { style, animated, ...rest } = edge;
      if (rest.markerEnd && typeof rest.markerEnd === 'object') {
        const markerEnd = { ...(rest.markerEnd as any) };
        delete markerEnd.color;
        return { ...rest, markerEnd };
      }
      return rest;
    })
  };
}

export function computeRunSubsetFromGraph(
  startNodeId: string,
  nodes: any[],
  edges: any[]
): { allowed: Set<string>; preview: Set<string> } {
  const successEdges = edges.filter((edge: any) => edge.sourceHandle !== 'failure');
  const failureEdges = edges.filter((edge: any) => edge.sourceHandle === 'failure');

  const successAdj = new Map<string, string[]>();
  const reverseSuccessAdj = new Map<string, string[]>();
  const failureBySource = new Map<string, string[]>();

  for (const node of nodes) {
    successAdj.set(node.id, []);
    reverseSuccessAdj.set(node.id, []);
    failureBySource.set(node.id, []);
  }

  for (const edge of successEdges) {
    if (successAdj.has(edge.source) && successAdj.has(edge.target)) {
      successAdj.get(edge.source)!.push(edge.target);
      reverseSuccessAdj.get(edge.target)!.push(edge.source);
    }
  }

  for (const edge of failureEdges) {
    if (failureBySource.has(edge.source) && successAdj.has(edge.target)) {
      failureBySource.get(edge.source)!.push(edge.target);
    }
  }

  const preview = new Set<string>();
  const q1: string[] = [startNodeId];
  while (q1.length) {
    const current = q1.shift()!;
    if (preview.has(current)) continue;
    preview.add(current);
    for (const next of successAdj.get(current) || []) {
      q1.push(next);
    }
  }

  const failureAllowed = new Set<string>();
  const q2: string[] = Array.from(preview);
  while (q2.length) {
    const current = q2.shift()!;
    for (const target of failureBySource.get(current) || []) {
      if (!failureAllowed.has(target)) {
        failureAllowed.add(target);
        q2.push(target);
      }
    }
  }

  const upstream = new Set<string>();
  const q3: string[] = [startNodeId];
  while (q3.length) {
    const current = q3.shift()!;
    for (const parent of reverseSuccessAdj.get(current) || []) {
      if (!upstream.has(parent)) {
        upstream.add(parent);
        q3.push(parent);
      }
    }
  }

  const nodeById = new Map(nodes.map((node: any) => [node.id, node]));
  const context = new Set<string>();
  for (const id of upstream) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.type === 'promptNode' || node.type === 'repoNode') {
      context.add(id);
    }
  }

  const allowed = new Set<string>([...preview, ...failureAllowed, ...context]);
  return { allowed, preview };
}

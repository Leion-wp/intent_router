type Snapshot = {
  nodes: any[];
  edges: any[];
  signature: string;
};

type PushSnapshotOptions = {
  history: Snapshot[];
  index: number;
  nextNodes: any[];
  nextEdges: any[];
  maxSnapshots: number;
};

type PushSnapshotResult = {
  history: Snapshot[];
  index: number;
  changed: boolean;
};

export function createGraphSnapshot(nodes: any[], edges: any[]): Snapshot {
  return {
    nodes: JSON.parse(JSON.stringify(nodes || [])),
    edges: JSON.parse(JSON.stringify(edges || [])),
    signature: JSON.stringify({ nodes: nodes || [], edges: edges || [] })
  };
}

export function pushGraphSnapshot(options: PushSnapshotOptions): PushSnapshotResult {
  const {
    history,
    index,
    nextNodes,
    nextEdges,
    maxSnapshots
  } = options;
  const nextSnapshot = createGraphSnapshot(nextNodes, nextEdges);
  const currentSignature = history[index]?.signature;
  if (currentSignature === nextSnapshot.signature) {
    return { history, index, changed: false };
  }

  const head = index >= 0 ? history.slice(0, index + 1) : [];
  const appended = [...head, nextSnapshot];
  const bounded = appended.length > maxSnapshots ? appended.slice(appended.length - maxSnapshots) : appended;
  return {
    history: bounded,
    index: bounded.length - 1,
    changed: true
  };
}

export function canUndoGraph(index: number): boolean {
  return index > 0;
}

export function canRedoGraph(index: number, length: number): boolean {
  return index >= 0 && index < length - 1;
}

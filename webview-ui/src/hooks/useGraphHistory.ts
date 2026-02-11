import { useCallback, useEffect, useRef, useState } from 'react';

type Snapshot = {
  nodes: any[];
  edges: any[];
  signature: string;
};

type UseGraphHistoryParams = {
  nodes: any[];
  edges: any[];
  setNodes: (value: any) => void;
  setEdges: (value: any) => void;
  maxSnapshots?: number;
};

export function useGraphHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
  maxSnapshots = 80
}: UseGraphHistoryParams) {
  const graphHistoryRef = useRef<Snapshot[]>([]);
  const graphHistoryIndexRef = useRef<number>(-1);
  const graphHistorySuppressRef = useRef<number>(0);
  const graphToastTimerRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [graphToast, setGraphToast] = useState<string>('');

  const updateUndoRedoFlags = useCallback(() => {
    const index = graphHistoryIndexRef.current;
    const length = graphHistoryRef.current.length;
    setCanUndo(index > 0);
    setCanRedo(index >= 0 && index < length - 1);
  }, []);

  const pushGraphSnapshot = useCallback((nextNodes: any[], nextEdges: any[]) => {
    const snapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nextNodes || [])),
      edges: JSON.parse(JSON.stringify(nextEdges || [])),
      signature: JSON.stringify({ nodes: nextNodes || [], edges: nextEdges || [] })
    };

    const current = graphHistoryRef.current;
    const currentIndex = graphHistoryIndexRef.current;
    const currentSignature = current[currentIndex]?.signature;
    if (snapshot.signature === currentSignature) {
      updateUndoRedoFlags();
      return;
    }

    const head = currentIndex >= 0 ? current.slice(0, currentIndex + 1) : [];
    const trimmed = [...head, snapshot];
    const bounded = trimmed.length > maxSnapshots ? trimmed.slice(trimmed.length - maxSnapshots) : trimmed;
    graphHistoryRef.current = bounded;
    graphHistoryIndexRef.current = bounded.length - 1;
    updateUndoRedoFlags();
  }, [maxSnapshots, updateUndoRedoFlags]);

  const showGraphToast = useCallback((text: string) => {
    setGraphToast(text);
    if (graphToastTimerRef.current) {
      window.clearTimeout(graphToastTimerRef.current);
    }
    graphToastTimerRef.current = window.setTimeout(() => {
      setGraphToast('');
      graphToastTimerRef.current = null;
    }, 1200);
  }, []);

  const applyGraphHistorySnapshot = useCallback((snapshot: { nodes: any[]; edges: any[] }) => {
    graphHistorySuppressRef.current = 2;
    setNodes(JSON.parse(JSON.stringify(snapshot.nodes || [])));
    setEdges(JSON.parse(JSON.stringify(snapshot.edges || [])));
  }, [setEdges, setNodes]);

  const undoGraph = useCallback(() => {
    if (graphHistoryIndexRef.current <= 0) return;
    graphHistoryIndexRef.current -= 1;
    const snapshot = graphHistoryRef.current[graphHistoryIndexRef.current];
    if (!snapshot) return;
    applyGraphHistorySnapshot(snapshot);
    updateUndoRedoFlags();
    showGraphToast(`Undo (${graphHistoryIndexRef.current + 1}/${graphHistoryRef.current.length})`);
  }, [applyGraphHistorySnapshot, showGraphToast, updateUndoRedoFlags]);

  const redoGraph = useCallback(() => {
    if (graphHistoryIndexRef.current < 0 || graphHistoryIndexRef.current >= graphHistoryRef.current.length - 1) return;
    graphHistoryIndexRef.current += 1;
    const snapshot = graphHistoryRef.current[graphHistoryIndexRef.current];
    if (!snapshot) return;
    applyGraphHistorySnapshot(snapshot);
    updateUndoRedoFlags();
    showGraphToast(`Redo (${graphHistoryIndexRef.current + 1}/${graphHistoryRef.current.length})`);
  }, [applyGraphHistorySnapshot, showGraphToast, updateUndoRedoFlags]);

  useEffect(() => {
    if (graphHistorySuppressRef.current > 0) {
      graphHistorySuppressRef.current -= 1;
      updateUndoRedoFlags();
      return;
    }
    pushGraphSnapshot(nodes, edges);
  }, [nodes, edges, pushGraphSnapshot, updateUndoRedoFlags]);

  useEffect(() => {
    return () => {
      if (graphToastTimerRef.current) {
        window.clearTimeout(graphToastTimerRef.current);
      }
    };
  }, []);

  return {
    canUndo,
    canRedo,
    graphToast,
    undoGraph,
    redoGraph
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canRedoGraph,
  canUndoGraph,
  pushGraphSnapshot as pushGraphSnapshotState
} from '../utils/graphHistoryUtils';

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
    setCanUndo(canUndoGraph(index));
    setCanRedo(canRedoGraph(index, length));
  }, []);

  const pushGraphSnapshot = useCallback((nextNodes: any[], nextEdges: any[]) => {
    const nextState = pushGraphSnapshotState({
      history: graphHistoryRef.current,
      index: graphHistoryIndexRef.current,
      nextNodes,
      nextEdges,
      maxSnapshots
    });
    graphHistoryRef.current = nextState.history as Snapshot[];
    graphHistoryIndexRef.current = nextState.index;
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

import { useCallback } from 'react';
import { Edge } from '@xyflow/react';
import { QuickAddItem } from '../types/quickAdd';
import {
  buildQuickAddNodeData,
  buildSplitInsertEdges,
  computeEdgeMidpointPosition
} from '../utils/nodeCreationUtils';

type UseQuickAddActionsOptions = {
  getId: () => string;
  getDefaultCapability: (providerName: string) => string;
  lastCanvasPos: { x: number; y: number } | null;
  reactFlowInstance: any;
  customNodesById: Map<string, any>;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
  setEdges: (updater: (edges: any[]) => any[]) => void;
  setQuickAddEdge: (edge: Edge | null) => void;
  setQuickAddPos: (pos: { x: number; y: number } | null) => void;
  setQuickAddAnchor: (anchor: { x: number; y: number } | null) => void;
  setQuickAddQuery: (value: string) => void;
  setQuickAddOpen: (value: boolean) => void;
};

export function useQuickAddActions(options: UseQuickAddActionsOptions) {
  const {
    getId,
    getDefaultCapability,
    lastCanvasPos,
    reactFlowInstance,
    customNodesById,
    setNodes,
    setEdges,
    setQuickAddEdge,
    setQuickAddPos,
    setQuickAddAnchor,
    setQuickAddQuery,
    setQuickAddOpen
  } = options;

  const addNodeFromItem = useCallback((item: QuickAddItem, pos?: { x: number; y: number }, edge?: Edge | null) => {
    const newId = getId();
    const type: any = item.nodeType;
    const data: any = buildQuickAddNodeData(item, {
      customNodesById,
      getDefaultCapability
    });

    let position = pos;
    if (!position) {
      if (lastCanvasPos) position = lastCanvasPos;
      else if (reactFlowInstance?.screenToFlowPosition) {
        position = reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      } else {
        position = { x: 300, y: 200 };
      }
    }

    if (edge && reactFlowInstance?.getNode) {
      const sourceNode = reactFlowInstance.getNode(edge.source);
      const targetNode = reactFlowInstance.getNode(edge.target);
      const midpoint = computeEdgeMidpointPosition(sourceNode, targetNode);
      if (midpoint) {
        position = midpoint;
      }
    }

    const newNode: any = {
      id: newId,
      type,
      data,
      position
    };

    setNodes((nodes) => nodes.concat(newNode));

    if (edge) {
      setEdges((edges) => {
        const remaining = edges.filter((entry) => entry.id !== edge.id);
        const split = buildSplitInsertEdges(edge, newId);
        return remaining.concat([split.first, split.second]);
      });
    }
  }, [customNodesById, getDefaultCapability, getId, lastCanvasPos, reactFlowInstance, setEdges, setNodes]);

  const openQuickAddPalette = useCallback(() => {
    const anchor = { x: Math.round(window.innerWidth * 0.52), y: Math.round(window.innerHeight * 0.42) };
    const pos = reactFlowInstance?.screenToFlowPosition
      ? reactFlowInstance.screenToFlowPosition(anchor)
      : null;
    setQuickAddEdge(null);
    setQuickAddPos(pos);
    setQuickAddAnchor(anchor);
    setQuickAddQuery('');
    setQuickAddOpen(true);
  }, [reactFlowInstance, setQuickAddAnchor, setQuickAddEdge, setQuickAddOpen, setQuickAddPos, setQuickAddQuery]);

  return {
    addNodeFromItem,
    openQuickAddPalette
  };
}

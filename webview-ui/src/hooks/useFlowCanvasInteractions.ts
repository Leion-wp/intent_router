import { useCallback } from 'react';

type UseFlowCanvasInteractionsOptions = {
  reactFlowInstance: any;
  quickAddOpen: boolean;
  setQuickAddOpen: (next: boolean) => void;
  setLastCanvasPos: (pos: { x: number; y: number } | null) => void;
  setQuickAddPos: (pos: { x: number; y: number } | null) => void;
  setQuickAddAnchor: (anchor: { x: number; y: number } | null) => void;
  setQuickAddEdge: (edge: any | null) => void;
  setQuickAddQuery: (value: string) => void;
  setContextMenu: (value: { x: number; y: number; nodeId: string } | null) => void;
};

export function useFlowCanvasInteractions(options: UseFlowCanvasInteractionsOptions) {
  const {
    reactFlowInstance,
    quickAddOpen,
    setQuickAddOpen,
    setLastCanvasPos,
    setQuickAddPos,
    setQuickAddAnchor,
    setQuickAddEdge,
    setQuickAddQuery,
    setContextMenu
  } = options;

  const onPaneClick = useCallback((event: any) => {
    if (quickAddOpen) setQuickAddOpen(false);
    if (reactFlowInstance?.screenToFlowPosition) {
      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setLastCanvasPos(position);
    }
    if (event?.detail === 2 && reactFlowInstance?.screenToFlowPosition) {
      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setQuickAddPos(position);
      setQuickAddAnchor({ x: event.clientX, y: event.clientY });
      setQuickAddEdge(null);
      setQuickAddQuery('');
      setQuickAddOpen(true);
    }
  }, [
    quickAddOpen,
    reactFlowInstance,
    setLastCanvasPos,
    setQuickAddAnchor,
    setQuickAddEdge,
    setQuickAddOpen,
    setQuickAddPos,
    setQuickAddQuery
  ]);

  const onNodeContextMenu = useCallback((event: any, node: any) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, [setContextMenu]);

  return { onPaneClick, onNodeContextMenu };
}

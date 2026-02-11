import { useEffect } from 'react';

type UseFlowKeyboardShortcutsParams = {
  quickAddOpen: boolean;
  dockOpen: boolean;
  setQuickAddOpen: (next: boolean) => void;
  setDockOpen: (next: boolean) => void;
  selectedNodeId: string | null;
  copyNodeById: (nodeId: string) => void;
  pasteCopiedNode: () => void;
  duplicateNodeById: (nodeId: string) => void;
  deleteSelectedNode: () => void;
  undoGraph: () => void;
  redoGraph: () => void;
  reactFlowInstance: any;
};

export function useFlowKeyboardShortcuts({
  quickAddOpen,
  dockOpen,
  setQuickAddOpen,
  setDockOpen,
  selectedNodeId,
  copyNodeById,
  pasteCopiedNode,
  duplicateNodeById,
  deleteSelectedNode,
  undoGraph,
  redoGraph,
  reactFlowInstance
}: UseFlowKeyboardShortcutsParams) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        const isEditable =
          tag === 'input' ||
          tag === 'textarea' ||
          (target as any).isContentEditable === true;
        if (isEditable) return;
      }
      if (e.key === 'Escape') {
        if (quickAddOpen) setQuickAddOpen(false);
        if (dockOpen) setDockOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'c' && selectedNodeId && selectedNodeId !== 'start') {
        e.preventDefault();
        copyNodeById(selectedNodeId);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteCopiedNode();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'd' && selectedNodeId && selectedNodeId !== 'start') {
        e.preventDefault();
        duplicateNodeById(selectedNodeId);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoGraph();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redoGraph();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && selectedNodeId !== 'start') {
        e.preventDefault();
        deleteSelectedNode();
      }
      if (e.key.toLowerCase() === 'f') {
        reactFlowInstance?.fitView?.({ duration: 200, padding: 0.2 });
      }
      if (e.key.toLowerCase() === 'z' && selectedNodeId && reactFlowInstance?.getNode) {
        const node = reactFlowInstance.getNode(selectedNodeId);
        if (node) {
          const zoom = reactFlowInstance.getZoom?.() || 1;
          const pos = node.positionAbsolute || node.position;
          const cx = pos.x + (node.width || 0) / 2;
          const cy = pos.y + (node.height || 0) / 2;
          reactFlowInstance.setCenter?.(cx, cy, { zoom, duration: 200 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    quickAddOpen,
    dockOpen,
    setQuickAddOpen,
    setDockOpen,
    selectedNodeId,
    copyNodeById,
    pasteCopiedNode,
    duplicateNodeById,
    deleteSelectedNode,
    undoGraph,
    redoGraph,
    reactFlowInstance
  ]);
}

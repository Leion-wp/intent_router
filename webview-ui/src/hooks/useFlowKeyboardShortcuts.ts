import { useEffect } from 'react';
import {
  resolveFlowKeyboardShortcutAction,
  shouldIgnoreFlowKeyboardShortcut,
  shouldPreventDefaultForFlowAction
} from '../utils/flowKeyboardShortcutUtils';

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
      if (shouldIgnoreFlowKeyboardShortcut(e.target as HTMLElement | null)) return;

      const action = resolveFlowKeyboardShortcutAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        selectedNodeId
      });
      if (!action) return;

      if (shouldPreventDefaultForFlowAction(action)) {
        e.preventDefault();
      }

      if (action === 'closeOverlays') {
        if (quickAddOpen) setQuickAddOpen(false);
        if (dockOpen) setDockOpen(false);
        return;
      }

      if (action === 'copyNode' && selectedNodeId) {
        copyNodeById(selectedNodeId);
        return;
      }

      if (action === 'pasteNode') {
        pasteCopiedNode();
        return;
      }

      if (action === 'duplicateNode' && selectedNodeId) {
        duplicateNodeById(selectedNodeId);
        return;
      }

      if (action === 'undo') {
        undoGraph();
        return;
      }

      if (action === 'redo') {
        redoGraph();
        return;
      }

      if (action === 'deleteNode') {
        deleteSelectedNode();
        return;
      }

      if (action === 'fitView') {
        reactFlowInstance?.fitView?.({ duration: 200, padding: 0.2 });
        return;
      }

      if (action === 'focusSelectedNode' && selectedNodeId && reactFlowInstance?.getNode) {
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

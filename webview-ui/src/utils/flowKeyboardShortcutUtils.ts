export type FlowKeyboardShortcutAction =
  | 'closeOverlays'
  | 'copyNode'
  | 'pasteNode'
  | 'duplicateNode'
  | 'undo'
  | 'redo'
  | 'deleteNode'
  | 'fitView'
  | 'focusSelectedNode';

export type FlowKeyboardShortcutInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  selectedNodeId?: string | null;
};

type KeyboardTargetLike = {
  tagName?: string | null;
  isContentEditable?: boolean | null;
};

const EDITABLE_TAGS = new Set(['input', 'textarea']);

function hasRunnableNodeSelection(selectedNodeId?: string | null): boolean {
  return Boolean(selectedNodeId && selectedNodeId !== 'start');
}

export function shouldIgnoreFlowKeyboardShortcut(target: KeyboardTargetLike | null | undefined): boolean {
  if (!target) {
    return false;
  }
  const tag = String(target.tagName || '').toLowerCase();
  return EDITABLE_TAGS.has(tag) || target.isContentEditable === true;
}

export function resolveFlowKeyboardShortcutAction(input: FlowKeyboardShortcutInput): FlowKeyboardShortcutAction | null {
  const key = input.key.toLowerCase();
  const hasModifier = input.ctrlKey || input.metaKey;
  const canActOnSelectedNode = hasRunnableNodeSelection(input.selectedNodeId);

  if (key === 'escape') return 'closeOverlays';

  if (hasModifier && !input.shiftKey && key === 'c' && canActOnSelectedNode) return 'copyNode';
  if (hasModifier && !input.shiftKey && key === 'v') return 'pasteNode';
  if (hasModifier && !input.shiftKey && key === 'd' && canActOnSelectedNode) return 'duplicateNode';

  if (hasModifier && !input.shiftKey && key === 'z') return 'undo';
  if (hasModifier && (key === 'y' || (input.shiftKey && key === 'z'))) return 'redo';

  if ((key === 'delete' || key === 'backspace') && canActOnSelectedNode) return 'deleteNode';
  if (key === 'f') return 'fitView';
  if (key === 'z' && canActOnSelectedNode) return 'focusSelectedNode';

  return null;
}

export function shouldPreventDefaultForFlowAction(action: FlowKeyboardShortcutAction): boolean {
  return (
    action === 'copyNode' ||
    action === 'pasteNode' ||
    action === 'duplicateNode' ||
    action === 'undo' ||
    action === 'redo' ||
    action === 'deleteNode'
  );
}

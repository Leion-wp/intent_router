import * as assert from 'assert';
import {
  resolveFlowKeyboardShortcutAction,
  shouldIgnoreFlowKeyboardShortcut,
  shouldPreventDefaultForFlowAction
} from '../../utils/flowKeyboardShortcutUtils';

function resolveAction(
  key: string,
  options?: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    selectedNodeId: string | null;
  }>
) {
  return resolveFlowKeyboardShortcutAction({
    key,
    ctrlKey: options?.ctrlKey ?? false,
    metaKey: options?.metaKey ?? false,
    shiftKey: options?.shiftKey ?? false,
    selectedNodeId: options?.selectedNodeId ?? null
  });
}

export function run() {
  assert.strictEqual(shouldIgnoreFlowKeyboardShortcut(null), false);
  assert.strictEqual(shouldIgnoreFlowKeyboardShortcut({ tagName: 'INPUT' }), true);
  assert.strictEqual(shouldIgnoreFlowKeyboardShortcut({ tagName: 'textarea' }), true);
  assert.strictEqual(shouldIgnoreFlowKeyboardShortcut({ tagName: 'div', isContentEditable: true }), true);
  assert.strictEqual(shouldIgnoreFlowKeyboardShortcut({ tagName: 'div', isContentEditable: false }), false);

  assert.strictEqual(resolveAction('Escape'), 'closeOverlays');
  assert.strictEqual(resolveAction('c', { ctrlKey: true, selectedNodeId: 'node-1' }), 'copyNode');
  assert.strictEqual(resolveAction('c', { ctrlKey: true, selectedNodeId: 'start' }), null);
  assert.strictEqual(resolveAction('c', { ctrlKey: true }), null);
  assert.strictEqual(resolveAction('v', { metaKey: true }), 'pasteNode');
  assert.strictEqual(resolveAction('d', { ctrlKey: true, selectedNodeId: 'node-1' }), 'duplicateNode');
  assert.strictEqual(resolveAction('d', { ctrlKey: true, selectedNodeId: 'start' }), null);
  assert.strictEqual(resolveAction('z', { ctrlKey: true }), 'undo');
  assert.strictEqual(resolveAction('y', { ctrlKey: true }), 'redo');
  assert.strictEqual(resolveAction('z', { ctrlKey: true, shiftKey: true }), 'redo');
  assert.strictEqual(resolveAction('Delete', { selectedNodeId: 'node-1' }), 'deleteNode');
  assert.strictEqual(resolveAction('Backspace', { selectedNodeId: 'node-1' }), 'deleteNode');
  assert.strictEqual(resolveAction('Delete', { selectedNodeId: 'start' }), null);
  assert.strictEqual(resolveAction('f'), 'fitView');
  assert.strictEqual(resolveAction('z', { selectedNodeId: 'node-1' }), 'focusSelectedNode');
  assert.strictEqual(resolveAction('z'), null);

  assert.strictEqual(shouldPreventDefaultForFlowAction('copyNode'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('pasteNode'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('duplicateNode'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('undo'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('redo'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('deleteNode'), true);
  assert.strictEqual(shouldPreventDefaultForFlowAction('fitView'), false);
  assert.strictEqual(shouldPreventDefaultForFlowAction('focusSelectedNode'), false);
  assert.strictEqual(shouldPreventDefaultForFlowAction('closeOverlays'), false);
}

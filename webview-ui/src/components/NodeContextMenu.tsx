import React from 'react';

type NodeContextMenuProps = {
  contextMenu: { x: number; y: number; nodeId: string } | null;
  canPaste: boolean;
  onOpenNode: (nodeId: string) => void;
  onCopyNode: (nodeId: string) => void;
  onPasteNode: (anchor: { x: number; y: number }) => void;
  onDuplicateNode: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onDisconnectNodeLinks: (nodeId: string) => void;
  onClearHighlight: () => void;
  onRunFromNode: (nodeId: string, dryRun?: boolean) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
};

const MENU_BUTTON_STYLE: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  color: 'var(--vscode-foreground)',
  border: 'none',
  padding: '8px',
  cursor: 'pointer'
};

export default function NodeContextMenu(props: NodeContextMenuProps) {
  const {
    contextMenu,
    canPaste,
    onOpenNode,
    onCopyNode,
    onPasteNode,
    onDuplicateNode,
    onToggleCollapse,
    onDisconnectNodeLinks,
    onClearHighlight,
    onRunFromNode,
    onDeleteNode,
    onClose
  } = props;

  if (!contextMenu) return null;

  const isStartNode = contextMenu.nodeId === 'start';

  return (
    <div
      className="nodrag"
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 1000,
        background: 'var(--vscode-editorWidget-background)',
        border: '1px solid var(--vscode-editorWidget-border)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        padding: '6px',
        borderRadius: '6px',
        minWidth: '160px'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="nodrag"
        onClick={() => {
          onOpenNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Open node
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onCopyNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Copy node
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onPasteNode({ x: contextMenu.x, y: contextMenu.y });
          onClose();
        }}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canPaste ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
          cursor: canPaste ? 'pointer' : 'not-allowed'
        }}
        disabled={!canPaste}
      >
        Paste node
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onDuplicateNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Duplicate node
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onToggleCollapse(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Toggle collapse
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onDisconnectNodeLinks(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Disconnect links
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onRunFromNode(contextMenu.nodeId, false);
          onClose();
        }}
        disabled={isStartNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: isStartNode ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
          cursor: isStartNode ? 'not-allowed' : 'pointer'
        }}
      >
        Run from here
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onRunFromNode(contextMenu.nodeId, true);
          onClose();
        }}
        disabled={isStartNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: isStartNode ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
          cursor: isStartNode ? 'not-allowed' : 'pointer'
        }}
      >
        Dry run from here
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onClearHighlight();
          onClose();
        }}
        style={{
          ...MENU_BUTTON_STYLE,
          opacity: 0.8
        }}
      >
        Clear highlight
      </button>
      <button
        className="nodrag"
        onClick={() => {
          onDeleteNode(contextMenu.nodeId);
          onClose();
        }}
        disabled={isStartNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: isStartNode ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-errorForeground)',
          cursor: isStartNode ? 'not-allowed' : 'pointer'
        }}
      >
        Delete node
      </button>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import {
  canDeleteContextNode,
  canDisconnectContextNode,
  canRunFromContextNode,
  canToggleCollapseContextNode
} from '../utils/nodeContextMenuUtils';

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
  color: 'var(--ir-node-text)',
  border: 'none',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'background 0.2s ease'
};

function NodeContextMenu(props: NodeContextMenuProps) {
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

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const firstButton = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    firstButton?.focus();
  }, [contextMenu]);

  if (!contextMenu) return null;

  const canRunFromNode = canRunFromContextNode(contextMenu.nodeId);
  const canDeleteNode = canDeleteContextNode(contextMenu.nodeId);
  const canToggleCollapse = canToggleCollapseContextNode(contextMenu.nodeId);
  const canDisconnectLinks = canDisconnectContextNode(contextMenu.nodeId);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Node context actions"
      tabIndex={-1}
      className="nodrag"
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 1000,
        background: 'var(--ir-glass-bg)',
        backdropFilter: 'var(--ir-glass-blur)',
        border: '1px solid var(--ir-glass-border)',
        boxShadow: 'var(--ir-glass-shadow)',
        padding: '8px',
        borderRadius: '12px',
        minWidth: '180px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onOpenNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Open node
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onCopyNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Copy node
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onPasteNode({ x: contextMenu.x, y: contextMenu.y });
          onClose();
        }}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canPaste ? 'var(--ir-node-text)' : 'rgba(255,255,255,0.3)',
          cursor: canPaste ? 'pointer' : 'not-allowed'
        }}
        disabled={!canPaste}
      >
        Paste node
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onDuplicateNode(contextMenu.nodeId);
          onClose();
        }}
        style={MENU_BUTTON_STYLE}
      >
        Duplicate node
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onToggleCollapse(contextMenu.nodeId);
          onClose();
        }}
        disabled={!canToggleCollapse}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canToggleCollapse ? 'var(--ir-node-text)' : 'rgba(255,255,255,0.3)',
          cursor: canToggleCollapse ? 'pointer' : 'not-allowed'
        }}
      >
        Toggle collapse
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onDisconnectNodeLinks(contextMenu.nodeId);
          onClose();
        }}
        disabled={!canDisconnectLinks}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canDisconnectLinks ? 'var(--ir-node-text)' : 'rgba(255,255,255,0.3)',
          cursor: canDisconnectLinks ? 'pointer' : 'not-allowed'
        }}
      >
        Disconnect links
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onRunFromNode(contextMenu.nodeId, false);
          onClose();
        }}
        disabled={!canRunFromNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canRunFromNode ? 'var(--ir-node-text)' : 'rgba(255,255,255,0.3)',
          cursor: canRunFromNode ? 'pointer' : 'not-allowed'
        }}
      >
        Run from here
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onRunFromNode(contextMenu.nodeId, true);
          onClose();
        }}
        disabled={!canRunFromNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canRunFromNode ? 'var(--ir-node-text)' : 'rgba(255,255,255,0.3)',
          cursor: canRunFromNode ? 'pointer' : 'not-allowed'
        }}
      >
        Dry run from here
      </button>
      <button
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
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
        type="button"
        role="menuitem"
        className="nodrag cp-card-hover"
        onClick={() => {
          onDeleteNode(contextMenu.nodeId);
          onClose();
        }}
        disabled={!canDeleteNode}
        style={{
          ...MENU_BUTTON_STYLE,
          color: canDeleteNode ? 'var(--ir-accent-error)' : 'rgba(255,255,255,0.3)',
          cursor: canDeleteNode ? 'pointer' : 'not-allowed'
        }}
      >
        Delete node
      </button>
    </div>
  );
}

export default React.memo(NodeContextMenu);

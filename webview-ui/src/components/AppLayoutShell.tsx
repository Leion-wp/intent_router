import React from 'react';

type AppLayoutShellProps = {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sidebarWidth: number;
  minSidebarWidth: number;
  maxSidebarWidth: number;
  defaultSidebarWidth: number;
  onSidebarResizerMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSidebarResizerDoubleClick: () => void;
  sidebar: React.ReactNode;
  canvas: React.ReactNode;
};

export default function AppLayoutShell({
  sidebarCollapsed,
  onToggleSidebar,
  sidebarWidth,
  minSidebarWidth,
  maxSidebarWidth,
  defaultSidebarWidth,
  onSidebarResizerMouseDown,
  onSidebarResizerDoubleClick,
  sidebar,
  canvas
}: AppLayoutShellProps) {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', flexDirection: 'row', position: 'relative' }}>
      {!sidebarCollapsed && (
        <>
          <div
            style={{
              width: `${sidebarWidth}px`,
              minWidth: `${minSidebarWidth}px`,
              maxWidth: `${maxSidebarWidth}px`,
              height: '100%',
              display: 'flex'
            }}
          >
            {sidebar}
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={onSidebarResizerMouseDown}
            onDoubleClick={onSidebarResizerDoubleClick}
            title={`Drag to resize sidebar (double-click to reset: ${defaultSidebarWidth}px)`}
            aria-label="Resize sidebar"
            role="separator"
          />
        </>
      )}
      <div style={{ flex: 1, position: 'relative' }}>
        <button
          className="nodrag"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show sidebar (Ctrl+B)' : 'Hide sidebar (Ctrl+B)'}
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            zIndex: 950,
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 10px',
            cursor: 'pointer'
          }}
        >
          {sidebarCollapsed ? '≡' : '⟨'}
        </button>
        {canvas}
      </div>
    </div>
  );
}

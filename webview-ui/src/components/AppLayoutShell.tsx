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
  onSidebarResizerKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  sidebar: React.ReactNode;
  canvas: React.ReactNode;
};

function AppLayoutShell({
  sidebarCollapsed,
  onToggleSidebar,
  sidebarWidth,
  minSidebarWidth,
  maxSidebarWidth,
  defaultSidebarWidth,
  onSidebarResizerMouseDown,
  onSidebarResizerDoubleClick,
  onSidebarResizerKeyDown,
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
            onKeyDown={onSidebarResizerKeyDown}
            title={`Drag to resize sidebar (double-click to reset: ${defaultSidebarWidth}px)`}
            aria-label="Resize sidebar"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={minSidebarWidth}
            aria-valuemax={maxSidebarWidth}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
          />
        </>
      )}
      <div style={{ flex: 1, position: 'relative' }}>
        <button
          type="button"
          className="nodrag"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!sidebarCollapsed}
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

export default React.memo(AppLayoutShell);

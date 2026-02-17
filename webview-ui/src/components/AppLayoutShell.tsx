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
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <button
          type="button"
          className="nodrag"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Show sidebar (Ctrl+B)' : 'Hide sidebar (Ctrl+B)'}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 950,
            background: 'var(--ir-glass-bg)',
            backdropFilter: 'var(--ir-glass-blur)',
            color: '#fff',
            border: '1px solid var(--ir-glass-border)',
            borderRadius: '10px',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <span className={`codicon codicon-${sidebarCollapsed ? 'layout-sidebar-left' : 'chevron-left'}`} style={{ fontSize: '18px' }}></span>
        </button>
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          {canvas}
        </div>
      </div>
    </div>
  );
}

export default React.memo(AppLayoutShell);

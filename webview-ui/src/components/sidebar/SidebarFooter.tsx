import React from 'react';

type SidebarFooterProps = {
  activeView: 'providers' | 'history' | 'environment' | 'studio';
  clearHistory: () => void;
};

export default function SidebarFooter({ activeView, clearHistory }: SidebarFooterProps) {
  return (
    <div className="sidebar-footer">
      {activeView === 'history' && (
        <button
          onClick={clearHistory}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--vscode-textLink-foreground)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px'
          }}
        >
          <span className="codicon codicon-trash"></span>
          Clear History
        </button>
      )}
      {activeView === 'providers' && (
        <>
          <span className="codicon codicon-info"></span>
          <span>Drag items · Ctrl+Shift+S focus search</span>
        </>
      )}
    </div>
  );
}

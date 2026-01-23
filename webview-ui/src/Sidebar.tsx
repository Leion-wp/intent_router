import React, { useState } from 'react';

type SidebarProps = {
    history?: any[];
    onSelectHistory?: (run: any) => void;
};

// Acquire VS Code API (safe singleton) - reuse from App or get from global
declare global {
  interface Window {
    vscode: any;
  }
}
const vscode = window.vscode || (window.vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : null);

export default function Sidebar({ history = [], onSelectHistory }: SidebarProps) {
  const [tab, setTab] = useState<'providers' | 'history'>('providers');

  const onDragStart = (event: React.DragEvent, nodeType: string, provider: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/provider', provider);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onClearHistory = () => {
    if (vscode) {
        vscode.postMessage({ type: 'clearHistory' });
    }
  };

  const providers = [
    { id: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
    { id: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
    { id: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
    { id: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Providers
      </div>

      <div className="sidebar-list">
        {providers.map((p) => (
          <div
            key={p.id}
            className="dndnode"
            onDragStart={(event) => onDragStart(event, 'actionNode', p.id)}
            draggable
            title={`Drag to add ${p.label} - ${p.desc}`}
            aria-label={`Add ${p.label} node`}
            tabIndex={0}
            role="listitem"
    <aside style={{
        width: '280px',
        minWidth: '240px',
        maxWidth: '360px',
        flexShrink: 0,
        borderRight: '1px solid var(--vscode-panel-border)',
        padding: '16px',
        background: 'var(--vscode-sideBar-background)',
        color: 'var(--vscode-sideBar-foreground)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)'
      }}>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px', gap: '16px' }}>
          <div
             onClick={() => setTab('providers')}
             style={{
                 cursor: 'pointer',
                 fontWeight: tab === 'providers' ? 'bold' : 'normal',
                 opacity: tab === 'providers' ? 1 : 0.6,
                 borderBottom: tab === 'providers' ? '2px solid var(--vscode-panelTitle-activeBorder)' : 'none'
             }}
          >
              PROVIDERS
          </div>
          <div
             onClick={() => setTab('history')}
             style={{
                 cursor: 'pointer',
                 fontWeight: tab === 'history' ? 'bold' : 'normal',
                 opacity: tab === 'history' ? 1 : 0.6,
                 borderBottom: tab === 'history' ? '2px solid var(--vscode-panelTitle-activeBorder)' : 'none'
             }}
          >
              HISTORY
          </div>
      </div>

      {tab === 'providers' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {providers.map((p) => (
            <div
                key={p.id}
                className="dndnode"
                onDragStart={(event) => onDragStart(event, 'actionNode', p.id)}
                draggable
                title={p.desc}
                role="listitem"
                tabIndex={0}
                aria-label={`Drag ${p.label} to graph`}
            >
                <span className={`codicon ${p.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
                <span>{p.label}</span>
            </div>
            ))}
        </div>
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
              {history.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                         onClick={onClearHistory}
                         style={{
                             background: 'none',
                             border: 'none',
                             color: 'var(--vscode-descriptionForeground)',
                             cursor: 'pointer',
                             fontSize: '11px',
                             textDecoration: 'underline'
                         }}
                      >
                          Clear History
                      </button>
                  </div>
              )}
              {history.length === 0 && <div style={{opacity: 0.6, fontSize: '12px'}}>No history available.</div>}
              {history.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => onSelectHistory?.(run)}
                    style={{
                      padding: '8px',
                      background: 'var(--vscode-list-hoverBackground)', // Use list background
                      cursor: 'pointer',
                      borderRadius: '4px',
                      border: '1px solid transparent',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.border = '1px solid var(--vscode-focusBorder)'}
                    onMouseOut={(e) => e.currentTarget.style.border = '1px solid transparent'}
                  >
                      <div style={{fontWeight: 'bold', fontSize: '12px', marginBottom: '4px'}}>{run.name}</div>
                      <div style={{fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between'}}>
                          <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                          <span style={{
                              color: run.status === 'success' ? 'var(--vscode-testing-iconPassed)' :
                                     (run.status === 'failure' || run.status === 'aborted') ? 'var(--vscode-testing-iconFailed)' :
                                     'var(--vscode-descriptionForeground)'
                          }}>
                              {run.status.toUpperCase()}
                          </span>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {tab === 'providers' && (
        <div style={{
            marginTop: 'auto',
            fontSize: '11px',
            opacity: 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        }}>
            <span className="codicon codicon-info"></span>
            <span>Drag items to the graph</span>
        </div>
      )}
    </aside>
  );
}

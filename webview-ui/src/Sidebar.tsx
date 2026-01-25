import React, { useState } from 'react';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
};

// Acquire VS Code API (safe singleton) - reuse from App or get from global
declare global {
  interface Window {
    vscode: any;
  }
}

export default function Sidebar({ history = [], onSelectHistory, onRestoreHistory }: SidebarProps) {
  const [tab, setTab] = useState<'providers' | 'history'>('providers');

  const onDragStart = (event: React.DragEvent, nodeType: string, provider?: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    if (provider) {
        event.dataTransfer.setData('application/reactflow/provider', provider);
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const clearHistory = () => {
    if (window.vscode) {
        window.vscode.postMessage({ type: 'clearHistory' });
    }
  };

  const items = [
    // Context / Setup Nodes
    { type: 'promptNode', label: 'Prompt', icon: 'codicon-symbol-string', desc: 'Set variable' },
    { type: 'repoNode', label: 'Repo', icon: 'codicon-repo', desc: 'Set workspace path' },
    { type: 'vscodeCommandNode', label: 'VS Code', icon: 'codicon-vscode', desc: 'Run an arbitrary VS Code command' },
    // Providers
    { type: 'actionNode', provider: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
    { type: 'actionNode', provider: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
    { type: 'actionNode', provider: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
    { type: 'actionNode', provider: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}>
          <div
             onClick={() => setTab('providers')}
             style={{
                 cursor: 'pointer',
                 fontWeight: tab === 'providers' ? 'bold' : 'normal',
                 opacity: tab === 'providers' ? 1 : 0.6,
                 borderBottom: tab === 'providers' ? '2px solid var(--vscode-panelTitle-activeBorder)' : 'none'
             }}
          >
              NODES
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
        <div className="sidebar-list">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="dndnode"
              onDragStart={(event) => onDragStart(event, item.type, item.provider)}
              draggable
              title={`Drag to add ${item.label} - ${item.desc}`}
              aria-label={`Add ${item.label} node`}
              tabIndex={0}
              role="listitem"
            >
              <span className={`codicon ${item.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : (
          <div className="sidebar-list" style={{ flex: 1, overflowY: 'auto' }}>
              {history.length === 0 && <div style={{opacity: 0.6, fontSize: '12px', padding: '8px'}}>No history available.</div>}
              {history.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => onSelectHistory?.(run)}
                    style={{
                      padding: '8px',
                      background: 'var(--vscode-list-hoverBackground)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      border: '1px solid transparent',
                      marginBottom: '8px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.border = '1px solid var(--vscode-focusBorder)'}
                    onMouseOut={(e) => e.currentTarget.style.border = '1px solid transparent'}
                  >
                      <div style={{fontWeight: 'bold', fontSize: '12px', marginBottom: '4px'}}>{run.name}</div>
                      <div style={{fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <span style={{
                                color: run.status === 'success' ? '#4caf50' : // Green
                                       run.status === 'failure' ? '#f44336' : // Red
                                       run.status === 'cancelled' ? '#e6c300' : // Gold
                                       'var(--vscode-descriptionForeground)'
                            }}>
                                {run.status.toUpperCase()}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRestoreHistory?.(run);
                                }}
                                title="Restore Snapshot"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--vscode-icon-foreground)',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    opacity: run.pipelineSnapshot?.meta?.ui ? 1 : 0.3
                                }}
                                disabled={!run.pipelineSnapshot?.meta?.ui}
                             >
                                <span className="codicon codicon-desktop-download"></span>
                             </button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      <div className="sidebar-footer">
        {tab === 'providers' ? (
            <>
                <span className="codicon codicon-info"></span>
                <span>Drag items to the graph</span>
            </>
        ) : (
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
      </div>
    </aside>
  );
}

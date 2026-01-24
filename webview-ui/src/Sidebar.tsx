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

export default function Sidebar({ history = [], onSelectHistory }: SidebarProps) {
  const [tab, setTab] = useState<'providers' | 'history'>('providers');

  const onDragStart = (event: React.DragEvent, nodeType: string, provider: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/provider', provider);
    event.dataTransfer.effectAllowed = 'move';
  };

  const clearHistory = () => {
    if (window.vscode) {
        window.vscode.postMessage({ type: 'clearHistory' });
    }
  };

  const providers = [
    { id: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
    { id: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
    { id: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
    { id: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' }
  ];

  return (
    <aside className="sidebar">
      <div
        className="sidebar-header"
        role="tablist"
        aria-label="Sidebar Navigation"
        style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}
      >
          <button
             role="tab"
             aria-selected={tab === 'providers'}
             aria-controls="panel-providers"
             id="tab-providers"
             onClick={() => setTab('providers')}
             className={`sidebar-tab ${tab === 'providers' ? 'active' : ''}`}
          >
              PROVIDERS
          </button>
          <button
             role="tab"
             aria-selected={tab === 'history'}
             aria-controls="panel-history"
             id="tab-history"
             onClick={() => setTab('history')}
             className={`sidebar-tab ${tab === 'history' ? 'active' : ''}`}
          >
              HISTORY
          </button>
      </div>

      {tab === 'providers' ? (
        <div id="panel-providers" role="tabpanel" aria-labelledby="tab-providers" className="sidebar-list">
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
            >
              <span className={`codicon ${p.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      ) : (
          <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" className="sidebar-list" style={{ flex: 1, overflowY: 'auto' }}>
              {history.length === 0 && <div style={{opacity: 0.6, fontSize: '12px', padding: '8px'}}>No history available.</div>}
              {history.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => onSelectHistory?.(run)}
                    className="history-item"
                  >
                      <span style={{fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', display: 'block'}}>{run.name}</span>
                      <span style={{fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between'}}>
                          <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                          <span style={{
                              color: run.status === 'success' ? '#4caf50' : // Green
                                     run.status === 'failure' ? '#f44336' : // Red
                                     run.status === 'cancelled' ? '#e6c300' : // Gold
                                     'var(--vscode-descriptionForeground)'
                          }}>
                              {run.status.toUpperCase()}
                          </span>
                      </span>
                  </button>
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

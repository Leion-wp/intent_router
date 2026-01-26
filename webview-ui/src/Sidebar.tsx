import React, { useState, useEffect } from 'react';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
};

// Acquire VS Code API (safe singleton) - reuse from App or get from global
declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

export default function Sidebar({ history = [], onSelectHistory }: SidebarProps) {
  const [tab, setTab] = useState<'providers' | 'history' | 'environment'>('providers');
  const [envVars, setEnvVars] = useState<{ key: string, value: string, visible: boolean }[]>([]);

  useEffect(() => {
    const loadEnv = (data: any) => {
        if (data) {
            const loaded = Object.entries(data).map(([k, v]) => ({
                key: k,
                value: String(v),
                visible: false
            }));
            setEnvVars(loaded);
        }
    };

    if (window.initialData?.environment) {
        loadEnv(window.initialData.environment);
    }

    const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'environmentUpdate') {
             loadEnv(event.data.environment);
        }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const saveEnv = (newVars: typeof envVars) => {
    setEnvVars(newVars);
    const envObj = newVars.reduce((acc, curr) => {
        if (curr.key) acc[curr.key] = curr.value;
        return acc;
    }, {} as Record<string, string>);

    if (window.vscode) {
        window.vscode.postMessage({
            type: 'saveEnvironment',
            environment: envObj
        });
    }
  };

  const addEnvVar = () => {
      const newVars = [...envVars, { key: '', value: '', visible: true }];
      setEnvVars(newVars);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
      const newVars = [...envVars];
      newVars[index] = { ...newVars[index], [field]: val };
      setEnvVars(newVars);
  };

  const toggleVisibility = (index: number) => {
      const newVars = [...envVars];
      newVars[index] = { ...newVars[index], visible: !newVars[index].visible };
      setEnvVars(newVars);
  };

  const removeEnvVar = (index: number) => {
      const newVars = envVars.filter((_, i) => i !== index);
      saveEnv(newVars);
  };

  const handleBlur = () => {
      saveEnv(envVars);
  };

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
      <div
        className="sidebar-header"
        role="tablist"
        aria-label="Sidebar Sections"
        style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}
      >
          <button
             role="tab"
             aria-selected={tab === 'providers'}
             aria-controls="panel-providers"
             id="tab-providers"
             onClick={() => setTab('providers')}
             className="sidebar-tab"
          >
              NODES
          </button>
          <button
             role="tab"
             aria-selected={tab === 'history'}
             aria-controls="panel-history"
             id="tab-history"
             onClick={() => setTab('history')}
             className="sidebar-tab"
          >
              HISTORY
          </button>
      </div>

      {tab === 'providers' ? (
        <div
          className="sidebar-list"
          role="tabpanel"
          id="panel-providers"
          aria-labelledby="tab-providers"
        >
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
          <div
            className="sidebar-list"
            role="tabpanel"
            id="panel-history"
            aria-labelledby="tab-history"
            style={{ flex: 1, overflowY: 'auto' }}
          >
              {history.length === 0 && <div style={{opacity: 0.6, fontSize: '12px', padding: '8px'}}>No history available.</div>}
              {history.map((run) => (
                  <button
                    key={run.id}
                    className="history-item"
                    onClick={() => onSelectHistory?.(run)}
                    aria-label={`Load run: ${run.name || 'Untitled'} (${run.status})`}
                    title={`Load run: ${run.name || 'Untitled'} - ${new Date(run.timestamp).toLocaleString()}`}
                  >
                    <div className="history-header">
                        <span className={`status-dot ${run.status}`}></span>
                        <span className="history-name">{run.name || 'Untitled Run'}</span>
                    </div>
                    <div className="history-meta">
                        {new Date(run.timestamp).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                    </div>
                  </button>
              ))}
        </div>
      )}

      <div className="sidebar-footer">
        {tab === 'history' && (
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
         {tab === 'providers' && (
            <>
                <span className="codicon codicon-info"></span>
                <span>Drag items to the graph</span>
            </>
        )}
      </div>
    </aside>
  );
}

function getTabStyle(active: boolean) {
    return {
         cursor: 'pointer',
         fontWeight: active ? 'bold' : 'normal',
         opacity: active ? 1 : 0.6,
         borderBottom: active ? '2px solid var(--vscode-panelTitle-activeBorder)' : 'none',
         paddingBottom: '4px'
    };
}

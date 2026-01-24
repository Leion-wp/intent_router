import React, { useState, useEffect } from 'react';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
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
    // Providers
    { type: 'actionNode', provider: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
    { type: 'actionNode', provider: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
    { type: 'actionNode', provider: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
    { type: 'actionNode', provider: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}>
          <div onClick={() => setTab('providers')} style={getTabStyle(tab === 'providers')}>NODES</div>
          <div onClick={() => setTab('history')} style={getTabStyle(tab === 'history')}>HISTORY</div>
          <div onClick={() => setTab('environment')} style={getTabStyle(tab === 'environment')}>ENV</div>
      </div>

      <div className="sidebar-content" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {tab === 'providers' && (
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
        )}

        {tab === 'history' && (
            <div className="sidebar-list">
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
                          <div style={{fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between'}}>
                              <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                              <span style={{
                                  color: run.status === 'success' ? '#4caf50' : // Green
                                         run.status === 'failure' ? '#f44336' : // Red
                                         run.status === 'cancelled' ? '#e6c300' : // Gold
                                         'var(--vscode-descriptionForeground)'
                              }}>
                                  {run.status.toUpperCase()}
                              </span>
                          </div>
                      </div>
                  ))}
            </div>
        )}

        {tab === 'environment' && (
            <div style={{ padding: '0 8px' }}>
                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
                    Workspace Environment Variables (injected into terminal & variables)
                </div>
                {envVars.map((v, i) => (
                    <div key={i} style={{ marginBottom: '8px', border: '1px solid var(--vscode-widget-border)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                            <input
                                type="text"
                                placeholder="Key"
                                value={v.key}
                                onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                                onBlur={handleBlur}
                                style={{
                                    flex: 1,
                                    background: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    padding: '4px',
                                    fontSize: '11px'
                                }}
                            />
                             <button
                                onClick={() => removeEnvVar(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                                title="Delete"
                            >
                                <span className="codicon codicon-trash"></span>
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                             <input
                                type={v.visible ? "text" : "password"}
                                placeholder="Value"
                                value={v.value}
                                onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                                onBlur={handleBlur}
                                style={{
                                    flex: 1,
                                    background: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    padding: '4px',
                                    fontSize: '11px'
                                }}
                            />
                            <button
                                onClick={() => toggleVisibility(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-foreground)' }}
                                title={v.visible ? "Hide" : "Show"}
                            >
                                <span className={`codicon ${v.visible ? 'codicon-eye-closed' : 'codicon-eye'}`}></span>
                            </button>
                        </div>
                    </div>
                ))}
                <button
                    onClick={addEnvVar}
                    style={{
                        width: '100%',
                        padding: '6px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                >
                    + Add Variable
                </button>
            </div>
        )}
      </div>

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

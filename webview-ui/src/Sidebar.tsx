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
      setEnvVars(newVars);
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
          <button
             role="tab"
             aria-selected={tab === 'environment'}
             aria-controls="panel-environment"
             id="tab-environment"
             onClick={() => setTab('environment')}
             className="sidebar-tab"
          >
              ENV
          </button>
      </div>

      {tab === 'providers' && (
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
      )}

      {tab === 'history' && (
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
                    onClick={() => onSelectHistory?.(run)}
                    className="history-item"
                    aria-label={`Select run: ${run.name}, status ${run.status}, from ${new Date(run.timestamp).toLocaleString()}`}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</span>
                        <span style={{ opacity: 0.7, fontSize: '10px' }}>{new Date(run.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: run.status === 'success' ? '#4caf50' : run.status === 'failure' ? '#f44336' : '#007acc'
                        }} aria-hidden="true"></div>
                        <span style={{ textTransform: 'capitalize' }}>{run.status}</span>
                    </div>
                </button>
              ))}
          </div>
      )}

      {tab === 'environment' && (
          <div
            className="sidebar-list"
            role="tabpanel"
            id="panel-environment"
            aria-labelledby="tab-environment"
            style={{ flex: 1, overflowY: 'auto' }}
          >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {envVars.map((env, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            placeholder="Key"
                            value={env.key}
                            onChange={(e) => updateEnvVar(idx, 'key', e.target.value)}
                            onBlur={handleBlur}
                            style={{ flex: 1, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                          />
                           <input
                            type={env.visible ? "text" : "password"}
                            placeholder="Value"
                            value={env.value}
                            onChange={(e) => updateEnvVar(idx, 'value', e.target.value)}
                            onBlur={handleBlur}
                            style={{ flex: 1, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                          />
                          <button onClick={() => toggleVisibility(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-icon-foreground)' }} aria-label={env.visible ? "Hide value" : "Show value"}>
                              <span className={`codicon codicon-${env.visible ? 'eye' : 'eye-closed'}`}></span>
                          </button>
                          <button onClick={() => removeEnvVar(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-icon-foreground)' }} aria-label="Remove variable">
                              <span className="codicon codicon-close"></span>
                          </button>
                      </div>
                  ))}
                  <button
                    onClick={addEnvVar}
                    style={{
                        padding: '6px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                  >
                    + Add Variable
                  </button>
              </div>
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

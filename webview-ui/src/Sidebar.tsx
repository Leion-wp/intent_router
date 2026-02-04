import React, { useMemo, useState, useEffect } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from './types/messages';
import SchemaArgsForm, { SchemaField } from './components/SchemaArgsForm';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
  tab?: 'providers' | 'history' | 'environment' | 'studio';
  onTabChange?: (tab: 'providers' | 'history' | 'environment' | 'studio') => void;
};

// Acquire VS Code API (safe singleton) - reuse from App or get from global
declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

export default function Sidebar({ history = [], onSelectHistory, onRestoreHistory, tab: tabProp, onTabChange }: SidebarProps) {
  const [internalTab, setInternalTab] = useState<'providers' | 'history' | 'environment' | 'studio'>('providers');
  const tab = tabProp ?? internalTab;
  const setTab = (next: 'providers' | 'history' | 'environment' | 'studio') => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  const [envVars, setEnvVars] = useState<{ key: string, value: string, visible: boolean }[]>([]);
  const [customNodes, setCustomNodes] = useState<any[]>((window.initialData?.customNodes as any[]) || []);
  const [studioSelectedId, setStudioSelectedId] = useState<string>('');
  const [studioDraft, setStudioDraft] = useState<any>(null);
  const [studioMappingJson, setStudioMappingJson] = useState<string>('{}');
  const [studioPreviewValues, setStudioPreviewValues] = useState<Record<string, any>>({});
  const [studioError, setStudioError] = useState<string>('');

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
	        if (!isInboundMessage(event.data)) {
	            return;
	        }
	        if (event.data.type === 'environmentUpdate') {
	             loadEnv(event.data.environment);
	        }
          if (event.data.type === 'customNodesUpdate') {
            setCustomNodes((event.data as any).nodes || []);
          }
	    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const allCapabilities: string[] = useMemo(() => {
    const groups = (window.initialData?.commandGroups as any[]) || [];
    const out: string[] = [];
    for (const g of groups) {
      for (const c of (g?.commands || [])) {
        const cap = String(c?.capability || '').trim();
        if (cap) out.push(cap);
      }
    }
    out.sort();
    return out;
  }, []);

  const saveEnv = (newVars: typeof envVars) => {
    setEnvVars(newVars);
    const envObj = newVars.reduce((acc, curr) => {
        if (curr.key) acc[curr.key] = curr.value;
        return acc;
    }, {} as Record<string, string>);

	    if (window.vscode) {
	        const msg: WebviewOutboundMessage = {
	            type: 'saveEnvironment',
	            environment: envObj
	        };
	        window.vscode.postMessage(msg);
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

  const onDragStartCustomNode = (event: React.DragEvent, customNodeId: string) => {
    event.dataTransfer.setData('application/reactflow/type', 'customNode');
    event.dataTransfer.setData('application/reactflow/customNodeId', customNodeId);
    event.dataTransfer.effectAllowed = 'move';
  };

	  const clearHistory = () => {
	    if (window.vscode) {
	        const msg: WebviewOutboundMessage = { type: 'clearHistory' };
	        window.vscode.postMessage(msg);
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

  const startNewDraft = () => {
    const draft = { id: '', title: '', intent: '', schema: [] as SchemaField[], mapping: {} as any };
    setStudioDraft(draft);
    setStudioSelectedId('');
    setStudioMappingJson('{}');
    setStudioPreviewValues({});
    setStudioError('');
  };

  const selectDraft = (id: string) => {
    const found = (customNodes || []).find((n: any) => String(n?.id || '') === id);
    if (!found) return;
    setStudioSelectedId(id);
    setStudioDraft({
      id: String(found.id || ''),
      title: String(found.title || ''),
      intent: String(found.intent || ''),
      schema: Array.isArray(found.schema) ? found.schema : [],
      mapping: found.mapping && typeof found.mapping === 'object' ? found.mapping : {}
    });
    setStudioMappingJson(JSON.stringify((found.mapping && typeof found.mapping === 'object') ? found.mapping : {}, null, 2));
    setStudioPreviewValues({});
    setStudioError('');
  };

  const saveDraft = () => {
    if (!studioDraft) return;
    const id = String(studioDraft.id || '').trim();
    const title = String(studioDraft.title || '').trim();
    const intent = String(studioDraft.intent || '').trim();
    if (!id || !title || !intent) {
      setStudioError('id, title, intent are required.');
      return;
    }

    let mapping: any = {};
    try {
      mapping = studioMappingJson.trim() ? JSON.parse(studioMappingJson) : {};
    } catch (e: any) {
      setStudioError(`Invalid mapping JSON: ${e?.message || e}`);
      return;
    }

    const node = {
      id,
      title,
      intent,
      schema: Array.isArray(studioDraft.schema) ? studioDraft.schema : [],
      mapping: mapping && typeof mapping === 'object' ? mapping : {}
    };

    setStudioError('');
    if (window.vscode) {
      const msg: WebviewOutboundMessage = { type: 'customNodes.upsert', node };
      window.vscode.postMessage(msg);
    }
    setStudioSelectedId(id);
  };

  const deleteDraft = (id: string) => {
    const target = String(id || '').trim();
    if (!target) return;
    if (window.vscode) {
      const msg: WebviewOutboundMessage = { type: 'customNodes.delete', id: target };
      window.vscode.postMessage(msg);
    }
    if (studioSelectedId === target) {
      setStudioSelectedId('');
      setStudioDraft(null);
      setStudioMappingJson('{}');
      setStudioPreviewValues({});
      setStudioError('');
    }
  };

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
          <button
             role="tab"
             aria-selected={tab === 'studio'}
             aria-controls="panel-studio"
             id="tab-studio"
             onClick={() => setTab('studio')}
             className="sidebar-tab"
          >
              STUDIO
          </button>
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

              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--vscode-panel-border)' }}>
                <div style={{ fontSize: '11px', opacity: 0.85, padding: '0 8px 6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Custom Nodes</span>
                  <button
                    className="nodrag"
                    onClick={() => setTab('studio')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--vscode-textLink-foreground)',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                    title="Open Node Studio"
                  >
                    Open Studio
                  </button>
                </div>
                {customNodes.length === 0 ? (
                  <div style={{ opacity: 0.6, fontSize: '12px', padding: '0 8px 8px 8px' }}>No custom nodes yet.</div>
                ) : (
                  <div className="sidebar-list">
                    {customNodes.map((n: any) => (
                      <div
                        key={String(n?.id || '')}
                        className="dndnode"
                        onDragStart={(event) => onDragStartCustomNode(event, String(n?.id || ''))}
                        draggable
                        title={`Drag to add ${String(n?.title || n?.id || 'Custom')}`}
                        aria-label={`Add custom node ${String(n?.title || n?.id || 'Custom')}`}
                        tabIndex={0}
                        role="listitem"
                      >
                        <span className="codicon codicon-symbol-structure" style={{ fontSize: '16px', marginRight: '8px' }}></span>
                        <span>{String(n?.title || n?.id || 'Custom')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
        )}

	        {tab === 'history' && (
	            <div className="sidebar-list">
	                 {history.length === 0 && <div style={{opacity: 0.6, fontSize: '12px', padding: '8px'}}>No history available.</div>}
	                 {history.map((run) => (
	                      <div
	                        key={run.id}
	                        onClick={() => onSelectHistory?.({ ...run })}
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
	                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
	                              <div style={{fontWeight: 'bold', fontSize: '12px'}}>{run.name}</div>
	                              <button
	                                  onClick={(e) => {
	                                      e.stopPropagation();
	                                      if (run.pipelineSnapshot) {
	                                          onRestoreHistory?.(run);
	                                      }
	                                  }}
	                                  disabled={!run.pipelineSnapshot}
	                                  title={run.pipelineSnapshot ? 'Restore this snapshot in the builder' : 'No snapshot available for this run'}
	                                  style={{
	                                      padding: '2px 8px',
	                                      fontSize: '10px',
	                                      borderRadius: '4px',
	                                      border: '1px solid var(--vscode-panel-border)',
	                                      background: run.pipelineSnapshot ? 'var(--vscode-button-background)' : 'transparent',
	                                      color: run.pipelineSnapshot ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
	                                      cursor: run.pipelineSnapshot ? 'pointer' : 'not-allowed',
	                                      opacity: run.pipelineSnapshot ? 1 : 0.6
	                                  }}
	                              >
	                                  Restore
	                              </button>
	                          </div>
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
	                          {!run.pipelineSnapshot && (
	                              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '6px' }}>
	                                  Snapshot unavailable (old run).
	                              </div>
	                          )}
	                      </div>
	                  ))}
	            </div>
	        )}

        {tab === 'studio' && (
          <div style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
              <button
                className="nodrag"
                onClick={startNewDraft}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                + New
              </button>
              <button
                className="nodrag"
                onClick={saveDraft}
                disabled={!studioDraft}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: studioDraft ? 'var(--vscode-button-background)' : 'transparent',
                  color: studioDraft ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                  border: studioDraft ? 'none' : '1px solid var(--vscode-panel-border)',
                  cursor: studioDraft ? 'pointer' : 'not-allowed',
                  fontSize: '11px',
                  opacity: studioDraft ? 1 : 0.6
                }}
              >
                Save
              </button>
            </div>

            {studioError && (
              <div style={{ color: 'var(--vscode-errorForeground)', fontSize: '11px', marginBottom: '8px' }}>
                {studioError}
              </div>
            )}

            <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>Existing</div>
            <div className="sidebar-list" style={{ marginBottom: '12px' }}>
              {customNodes.length === 0 && (
                <div style={{ opacity: 0.6, fontSize: '12px', padding: '6px 0' }}>No custom nodes yet.</div>
              )}
              {customNodes.map((n: any) => {
                const nid = String(n?.id || '');
                const selected = studioSelectedId === nid;
                return (
                  <div
                    key={nid}
                    onClick={() => selectDraft(nid)}
                    draggable
                    onDragStart={(event) => onDragStartCustomNode(event, nid)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: selected ? '1px solid var(--vscode-focusBorder)' : '1px solid transparent',
                      background: selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span className="codicon codicon-symbol-structure"></span>
                      <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {String(n?.title || nid)}
                      </span>
                    </div>
                    <button
                      className="nodrag"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDraft(nid);
                      }}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                    >
                      <span className="codicon codicon-trash"></span>
                    </button>
                  </div>
                );
              })}
            </div>

            {studioDraft && (
              <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Editor</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    className="nodrag"
                    placeholder="id (unique)"
                    value={String(studioDraft.id || '')}
                    onChange={(e) => setStudioDraft({ ...studioDraft, id: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    className="nodrag"
                    placeholder="title"
                    value={String(studioDraft.title || '')}
                    onChange={(e) => setStudioDraft({ ...studioDraft, title: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                      fontSize: '11px'
                    }}
                  />

                  <div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Intent</div>
                    <input
                      className="nodrag"
                      list="studio-intents"
                      placeholder="intent (e.g. git.checkout)"
                      value={String(studioDraft.intent || '')}
                      onChange={(e) => setStudioDraft({ ...studioDraft, intent: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        fontSize: '11px'
                      }}
                    />
                    <datalist id="studio-intents">
                      {allCapabilities.map((cap) => (
                        <option key={cap} value={cap} />
                      ))}
                    </datalist>
                  </div>

                  <div style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.85 }}>Schema</div>
                      <button
                        className="nodrag"
                        onClick={() => setStudioDraft({ ...studioDraft, schema: [...(studioDraft.schema || []), { name: '', type: 'string' }] })}
                        style={{
                          background: 'none',
                          border: '1px solid var(--vscode-panel-border)',
                          color: 'var(--vscode-foreground)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        + Field
                      </button>
                    </div>

                    {(studioDraft.schema || []).map((f: SchemaField, i: number) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 1fr 24px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                        <input
                          className="nodrag"
                          placeholder="name"
                          value={String(f?.name || '')}
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            next[i] = { ...next[i], name: e.target.value };
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        />
                        <select
                          className="nodrag"
                          value={String(f?.type || 'string')}
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            next[i] = { ...next[i], type: e.target.value as any };
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        >
                          <option value="string">string</option>
                          <option value="boolean">boolean</option>
                          <option value="enum">enum</option>
                          <option value="path">path</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                          <input
                            className="nodrag"
                            type="checkbox"
                            checked={!!f?.required}
                            onChange={(e) => {
                              const next = [...(studioDraft.schema || [])];
                              next[i] = { ...next[i], required: e.target.checked };
                              setStudioDraft({ ...studioDraft, schema: next });
                            }}
                          />
                          req
                        </label>
                        <input
                          className="nodrag"
                          placeholder="default / options (enum: a,b,c)"
                          value={
                            f?.type === 'enum'
                              ? (Array.isArray(f?.options) ? (f?.options as any[]).join(',') : String(f?.options || ''))
                              : (f?.default !== undefined ? String(f?.default) : '')
                          }
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            if (String(next[i]?.type) === 'enum') {
                              const raw = e.target.value;
                              next[i] = { ...next[i], options: raw.split(',').map(s => s.trim()).filter(Boolean) };
                            } else {
                              next[i] = { ...next[i], default: e.target.value };
                            }
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        />
                        <button
                          className="nodrag"
                          onClick={() => {
                            const next = [...(studioDraft.schema || [])];
                            next.splice(i, 1);
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          title="Remove"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ fontSize: '10px', opacity: 0.65 }}>Mapping defaults to identity if left empty.</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Mapping (JSON)</div>
                    <textarea
                      className="nodrag"
                      value={studioMappingJson}
                      onChange={(e) => setStudioMappingJson(e.target.value)}
                      placeholder='{ "payloadKey": "fieldName" }'
                      style={{
                        width: '100%',
                        minHeight: '90px',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--vscode-editor-font-family, monospace)'
                      }}
                    />
                  </div>

                  <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Preview</div>
                    <SchemaArgsForm
                      nodeId="studio-preview"
                      fields={[...(studioDraft.schema || []), { name: 'description', type: 'string', description: 'Step description for logs' }]}
                      values={studioPreviewValues}
                      onChange={(name, value) => setStudioPreviewValues((prev) => ({ ...prev, [name]: value }))}
                      availableVars={[]}
                    />
                  </div>
                </div>
              </div>
            )}
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


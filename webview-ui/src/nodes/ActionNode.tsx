import { memo, useMemo, useState, useEffect, useContext, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext, RegistryContext } from '../App';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import SchemaArgsForm from '../components/SchemaArgsForm';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)'
};

// Fallback if registry is empty (during loading or error)
const FALLBACK_CAPS: any[] = [];

const ActionNode = ({ data, id }: NodeProps) => {
  const { commandGroups } = useContext(RegistryContext);
  const { getAvailableVars, isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [provider, setProvider] = useState<string>((data.provider as string) || 'terminal');
  const [capability, setCapability] = useState<string>((data.capability as string) || '');
  const [args, setArgs] = useState<Record<string, any>>((data.args as Record<string, any>) || {});
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [varPickerOpen, setVarPickerOpen] = useState<Record<string, boolean>>({});
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!data.collapsed;

  // Sync from props if data changes externally
  useEffect(() => {
    if (data.provider) setProvider(data.provider as string);
    if (data.capability) setCapability(data.capability as string);
    if (data.args) setArgs(data.args as Record<string, any>);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || '');

    // Auto-open console if logs exist and we just started running or got logs
    if (data.logs && (data.logs as any[]).length > 0 && !isConsoleOpen) {
        setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = (data.logs as any[]) || [];

  // Auto-scroll logs
  useEffect(() => {
    if (isConsoleOpen && logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isConsoleOpen]);

  // Find capabilities for current provider
  const currentProviderGroup = commandGroups?.find((g: any) => g.provider === provider);
  const currentCaps = currentProviderGroup?.commands || FALLBACK_CAPS;

  // Default capability selection
  useEffect(() => {
    // If capability is empty, select a default
    if (!capability && currentCaps.length > 0) {
       // Try to find 'run' or just take first
       const defaultCap = currentCaps.find((c: any) => c.capability.endsWith('.run'))?.capability || currentCaps[0].capability;
       setCapability(defaultCap);
       updateNodeData(id, { provider, capability: defaultCap });
    }
  }, [provider, currentCaps]);

  const handleArgChange = (key: string, value: any) => {
    const newArgs = { ...args, [key]: value };
    setArgs(newArgs);
    updateNodeData(id, { args: newArgs });
  };

  const availableVars = useMemo(() => {
    try {
      return getAvailableVars();
    } catch {
      return [];
    }
  }, [getAvailableVars]);

  const insertVariable = (key: string, varName?: string) => {
    const current = args[key] || '';
    const name = (varName || '').trim();
    if (!name) {
      return;
    }
    handleArgChange(key, current + `\${var:${name}}`);
  };

  const openVarPicker = (argName: string) => {
    setVarPickerOpen(prev => ({ ...prev, [argName]: true }));
  };

  const closeVarPicker = (argName: string) => {
    setVarPickerOpen(prev => ({ ...prev, [argName]: false }));
  };

	  const handleBrowse = (key: string) => {
	      // Send message to extension
	      if (window.vscode) {
	          const msg: WebviewOutboundMessage = {
	              type: 'selectPath',
	              id: id,
	              argName: key
	          };
	          window.vscode.postMessage(msg);

	          // Listen for the response
	          const handleMessage = (event: MessageEvent) => {
	              const message = event.data;
	              if (!isInboundMessage(message)) {
	                  return;
	              }
	              if (message.type === 'pathSelected' && message.id === id && message.argName === key) {
	                  handleArgChange(key, message.path);
	                  window.removeEventListener('message', handleMessage);
	              }
	          };
	          window.addEventListener('message', handleMessage);
	      } else {
          console.log('Browse clicked (Mock):', key);
          // Mock for browser dev
          const mockPath = '/mock/path/to/folder';
          handleArgChange(key, mockPath);
      }
  };

  const toggleHelp = (key: string) => {
      setExpandedHelp(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Find the selected capability configuration
  // We need to handle cases where capability might be just suffix (legacy) or full string
  let selectedCapConfig = currentCaps.find((c: any) => c.capability === capability);
  if (!selectedCapConfig && capability) {
      // Fallback: try to match by suffix if user manually edited JSON or old format
      selectedCapConfig = currentCaps.find((c: any) => c.capability.endsWith(`.${capability}`));
  }

  // Default args include 'description' which is standard for all steps
  const schemaArgs = selectedCapConfig?.args || [];
  const displayArgs = [
     ...schemaArgs,
     { name: 'description', type: 'string', description: 'Step description for logs' }
  ];
  const useSharedForm = true;

  // Initialize Defaults & Validate & Fetch Dynamic Options
  useEffect(() => {
      if (useSharedForm) {
          return;
      }
      const newArgs = { ...args };
      let changed = false;
      const newErrors: Record<string, boolean> = {};

      displayArgs.forEach((arg: any) => {
          // Initialize default if undefined
          if (newArgs[arg.name] === undefined && arg.default !== undefined) {
              newArgs[arg.name] = arg.default;
              changed = true;
          }

          // Validate required
          if (arg.required && (newArgs[arg.name] === undefined || newArgs[arg.name] === '')) {
              newErrors[arg.name] = true;
          }

	          // Fetch dynamic options
	          if (arg.type === 'enum' && typeof arg.options === 'string' && !dynamicOptions[arg.name]) {
	             if (window.vscode) {
	                 const msg: WebviewOutboundMessage = {
	                     type: 'fetchOptions',
	                     command: arg.options,
	                     argName: arg.name
	                 };
	                 window.vscode.postMessage(msg);
	             }
	          }
      });

      if (changed) {
          setArgs(newArgs);
          updateNodeData(id, { args: newArgs });
      }
      setErrors(newErrors);

  }, [capability, args, selectedCapConfig]);

	  // Listen for option responses
	  useEffect(() => {
        if (useSharedForm) {
            return;
        }
	      const handleMessage = (event: MessageEvent) => {
	          const message = event.data;
	          if (!isInboundMessage(message)) {
	              return;
	          }
	          if (message.type === 'optionsFetched') {
	              setDynamicOptions(prev => ({
	                  ...prev,
	                  [message.argName]: message.options
	              }));
	          }
	      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
  }, []);


  const isPause = provider === 'system' && capability === 'system.pause';
  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;
  const previewGlow = isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none';
  const determinism: 'deterministic' | 'interactive' =
    selectedCapConfig?.determinism === 'interactive' ? 'interactive' : 'deterministic';
  const determinismBadge = determinism === 'interactive' ? '👤' : '⚙';

  const fallbackTitle = `${provider} · ${selectedCapConfig?.capability || capability}`.trim();

  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: `2px solid ${isPause ? '#e6c300' : borderColor}`, // Gold for pause
      boxShadow: status === 'running' ? `0 0 10px ${borderColor}, ${previewGlow}` : previewGlow,
      minWidth: '250px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Left} />

      <Handle
        type="source"
        position={Position.Right}
        id="failure"
        title="On Failure"
        style={{ top: '30%', background: 'var(--ir-status-error)' }}
      />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 'bold', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="codicon codicon-gear"></span>
          <span
            title={determinism === 'interactive' ? 'Interactive (requires human / UI)' : 'Deterministic'}
            style={{ fontSize: '12px', opacity: determinism === 'interactive' ? 1 : 0.85 }}
          >
            {determinismBadge}
          </span>
          {editingLabel ? (
            <input
              className="nodrag"
              value={label}
              autoFocus
              onChange={(e) => {
                const v = e.target.value;
                setLabel(v);
                updateNodeData(id, { label: v });
              }}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingLabel(false);
              }}
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
            />
          ) : (
            <span
              title="Click to rename"
              onClick={() => setEditingLabel(true)}
              style={{ cursor: 'text', userSelect: 'none' }}
            >
              {label || fallbackTitle}
            </span>
          )}
        </div>
        {status !== 'idle' && <span className={`status-badge ${status}`}>{status}</span>}
        <button
          className="nodrag"
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'transparent',
            color: 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-editorWidget-border)',
            borderRadius: '4px',
            width: '20px',
            height: '20px',
            cursor: 'pointer'
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
      <>
      <div style={{ marginBottom: '8px' }}>
        <select
          aria-label="Select capability"
          className="nodrag"
          value={selectedCapConfig?.capability || capability}
          onChange={(e) => {
            setCapability(e.target.value);
            // We keep args that match names, but effectively "reset" behavior is complex.
            // For now, keeping overlap is fine, defaults will fill in.
            updateNodeData(id, { capability: e.target.value });
          }}
          style={{
            width: '100%',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            padding: '4px'
          }}
        >
          {currentCaps.map((c: any) => (
            <option key={c.capability} value={c.capability}>
                {c.capability.split('.').pop()}
            </option>
          ))}
        </select>
        {selectedCapConfig?.description && (
            <div style={{ fontSize: '0.7em', opacity: 0.7, marginTop: '4px' }}>
                {selectedCapConfig.description}
            </div>
        )}
      </div>

      <SchemaArgsForm nodeId={id} fields={displayArgs as any} values={args} onChange={handleArgChange} availableVars={availableVars} />

      {/* Legacy inline renderer kept for reference (disabled) */}
      {false && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayArgs.map((arg: any) => {
          const inputId = `input-${id}-${arg.name}`;
          const isRequired = arg.required;
          const showHelp = expandedHelp[arg.name];
          const hasError = errors[arg.name];
          const inputBorderColor = hasError ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border)';

          return (
            <div key={arg.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor={inputId} style={{ fontSize: '0.75em', opacity: 0.9, display: 'flex', alignItems: 'center', color: hasError ? 'var(--vscode-inputValidation-errorForeground)' : 'inherit' }}>
                      {arg.name}
                      {isRequired && <span style={{ color: 'var(--ir-status-error)', marginLeft: '2px' }}>*</span>}
                  </label>
                  {arg.description && (
                      <button
                          onClick={() => toggleHelp(arg.name)}
                          title="Toggle description"
                          className="nodrag"
                          style={{
                              background: 'none',
                              border: 'none',
                              color: showHelp ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-descriptionForeground)',
                              cursor: 'pointer',
                              fontSize: '0.9em',
                              padding: '0 4px'
                          }}
                      >
                          ⓘ
                      </button>
                  )}
              </div>

              {showHelp && arg.description && (
                  <div style={{
                      fontSize: '0.7em',
                      color: 'var(--vscode-descriptionForeground)',
                      marginBottom: '2px',
                      fontStyle: 'italic',
                      padding: '2px 4px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '2px'
                  }}>
                      {arg.description}
                  </div>
              )}

              {arg.type === 'boolean' ? (
                   <input
                       id={inputId}
                       type="checkbox"
                       className="nodrag"
                       checked={!!args[arg.name]}
                       onChange={(e) => handleArgChange(arg.name, e.target.checked)}
                       style={{
                         alignSelf: 'flex-start',
                         outline: hasError ? `1px solid ${inputBorderColor}` : 'none'
                       }}
                   />
              ) : arg.type === 'enum' ? (
                   <select
                       id={inputId}
                       className="nodrag"
                       value={args[arg.name] || ''}
                       onChange={(e) => handleArgChange(arg.name, e.target.value)}
                       style={{
                           width: '100%',
                           background: 'var(--vscode-input-background)',
                           color: 'var(--vscode-input-foreground)',
                           border: `1px solid ${inputBorderColor}`,
                           padding: '4px'
                       }}
                   >
                       <option value="">(Select)</option>
                       {(Array.isArray(arg.options) ? arg.options : (dynamicOptions[arg.name] || [])).map((opt: string) => (
                           <option key={opt} value={opt}>{opt}</option>
                       ))}
                   </select>
	              ) : arg.type === 'path' ? (
	                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      id={inputId}
                      className="nodrag"
                      type="text"
                      value={args[arg.name] || ''}
                      onChange={(e) => handleArgChange(arg.name, e.target.value)}
                      placeholder={arg.default !== undefined ? `${arg.default} (default)` : ''}
                      style={{
                        flex: 1,
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: `1px solid ${inputBorderColor}`,
                        padding: '4px',
                        fontSize: '0.9em'
                      }}
                    />
                    <button
                        className="nodrag"
                        onClick={() => handleBrowse(arg.name)}
                        title="Browse..."
                        style={{
                            background: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 8px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <span className="codicon codicon-folder-opened"></span>
                    </button>
	                    <button
	                      className="nodrag"
	                      onClick={() => openVarPicker(arg.name)}
	                      title="Insert variable (${var:...})"
	                      style={{
	                        background: 'var(--vscode-button-background)',
	                        color: 'var(--vscode-button-foreground)',
	                        border: 'none',
	                        cursor: 'pointer',
	                        width: '24px',
	                        display: 'flex',
	                        alignItems: 'center',
	                        justifyContent: 'center'
	                      }}
	                    >
	                      {'{ }'}
	                    </button>
	                    {varPickerOpen[arg.name] && (
	                      <select
	                        className="nodrag"
	                        autoFocus
	                        value=""
	                        onBlur={() => closeVarPicker(arg.name)}
	                        onChange={(e) => {
	                          const selected = e.target.value;
	                          if (selected) {
	                            insertVariable(arg.name, selected);
	                          }
	                          closeVarPicker(arg.name);
	                        }}
	                        style={{
	                          maxWidth: '160px',
	                          background: 'var(--vscode-input-background)',
	                          color: 'var(--vscode-input-foreground)',
	                          border: '1px solid var(--vscode-input-border)',
	                          padding: '4px',
	                          fontSize: '0.9em'
	                        }}
	                      >
	                        <option value="">Select var…</option>
	                        {availableVars.map((v) => (
	                          <option key={v} value={v}>{v}</option>
	                        ))}
	                      </select>
	                    )}
	                  </div>
	              ) : (
	                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      id={inputId}
                      className="nodrag"
                      type="text"
                      value={args[arg.name] || ''}
                      onChange={(e) => handleArgChange(arg.name, e.target.value)}
                      placeholder={arg.default !== undefined ? `${arg.default} (default)` : ''}
                      style={{
                        flex: 1,
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: `1px solid ${inputBorderColor}`,
                        padding: '4px',
                        fontSize: '0.9em'
                      }}
                    />
	                    <button
	                      className="nodrag"
	                      onClick={() => openVarPicker(arg.name)}
	                      title="Insert variable (${var:...})"
	                      aria-label={`Insert variable for ${arg.name}`}
	                      style={{
	                        background: 'var(--vscode-button-background)',
	                        color: 'var(--vscode-button-foreground)',
	                        border: 'none',
	                        cursor: 'pointer',
	                        width: '24px',
	                        display: 'flex',
	                        alignItems: 'center',
	                        justifyContent: 'center'
	                      }}
	                    >
	                      {'{ }'}
	                    </button>
	                    {varPickerOpen[arg.name] && (
	                      <select
	                        className="nodrag"
	                        autoFocus
	                        value=""
	                        onBlur={() => closeVarPicker(arg.name)}
	                        onChange={(e) => {
	                          const selected = e.target.value;
	                          if (selected) {
	                            insertVariable(arg.name, selected);
	                          }
	                          closeVarPicker(arg.name);
	                        }}
	                        style={{
	                          maxWidth: '160px',
	                          background: 'var(--vscode-input-background)',
	                          color: 'var(--vscode-input-foreground)',
	                          border: '1px solid var(--vscode-input-border)',
	                          padding: '4px',
	                          fontSize: '0.9em'
	                        }}
	                      >
	                        <option value="">Select var…</option>
	                        {availableVars.map((v) => (
	                          <option key={v} value={v}>{v}</option>
	                        ))}
	                      </select>
	                    )}
	                  </div>
	              )}
            </div>
          );
        })}
      </div>
      )}
      </>
      )}

      <Handle type="source" position={Position.Right} />

      {/* Mini-Console */}
      {!collapsed && logs.length > 0 && (
        <div className="nodrag" style={{ marginTop: '8px', borderTop: '1px solid var(--vscode-widget-border)' }}>
            <div
                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                style={{
                    fontSize: '0.8em',
                    padding: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--vscode-editor-background)',
                    opacity: 0.8
                }}>
                <span>Output ({logs.length})</span>
                <span>{isConsoleOpen ? '▼' : '▶'}</span>
            </div>
            {isConsoleOpen && (
                <div
                    ref={logsRef}
                    style={{
                        maxHeight: '150px',
                        overflowY: 'auto',
                        background: '#1e1e1e', // Hardcoded dark background for console look
                        color: '#cccccc',
                        padding: '4px',
                        fontSize: '0.75em',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        borderBottomLeftRadius: '4px',
                        borderBottomRightRadius: '4px'
                    }}>
                    {logs.map((log: any, i: number) => (
                        <span key={i} style={{ color: log.stream === 'stderr' ? 'var(--ir-status-error)' : 'inherit', display: 'block' }}>
                            {log.text}
                        </span>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default memo(ActionNode);


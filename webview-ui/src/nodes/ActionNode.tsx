import React, { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RegistryContext } from '../App';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: '#007acc', // VS Code Blue
  success: '#4caf50', // Green
  failure: '#f44336'  // Red
};

// Fallback if registry is empty (during loading or error)
const FALLBACK_CAPS: any[] = [];

const ActionNode = ({ data, id }: NodeProps) => {
  const { commandGroups } = useContext(RegistryContext);
  const [provider, setProvider] = useState<string>((data.provider as string) || 'terminal');
  const [capability, setCapability] = useState<string>((data.capability as string) || '');
  const [args, setArgs] = useState<Record<string, any>>((data.args as Record<string, any>) || {});
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});

  // Sync from props if data changes externally
  useEffect(() => {
    if (data.provider) setProvider(data.provider as string);
    if (data.capability) setCapability(data.capability as string);
    if (data.args) setArgs(data.args as Record<string, any>);
    if (data.status) setStatus(data.status as string);
  }, [data]);

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
       updateData(provider, defaultCap, args);
    }
  }, [provider, currentCaps]);

  const updateData = (p: string, c: string, a: any) => {
    // We mutate the data object directly because ReactFlow uses it by reference
    data.provider = p;
    data.capability = c;
    data.args = a;
  };

  const handleArgChange = (key: string, value: any) => {
    const newArgs = { ...args, [key]: value };
    setArgs(newArgs);
    updateData(provider, capability, newArgs);
  };

  const insertVariable = (key: string) => {
    const current = args[key] || '';
    handleArgChange(key, current + '${input:Prompt}');
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

  const isPause = provider === 'system' && capability === 'system.pause';
  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;

  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: `2px solid ${isPause ? '#e6c300' : borderColor}`, // Gold for pause
      boxShadow: status === 'running' ? `0 0 10px ${borderColor}` : 'none',
      minWidth: '250px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Top} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 'bold', textTransform: 'capitalize' }}>
        <span>{provider}</span>
        {status !== 'idle' && <span style={{ fontSize: '0.8em', color: borderColor }}>●</span>}
      </div>

      <div style={{ marginBottom: '8px' }}>
        <select
          aria-label="Select capability"
          className="nodrag"
          value={selectedCapConfig?.capability || capability}
          onChange={(e) => {
            setCapability(e.target.value);
            // Clear args that might not apply, or keep them? Keeping is safer for now.
            updateData(provider, e.target.value, args);
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayArgs.map((arg: any) => {
          const inputId = `input-${id}-${arg.name}`;
          const isRequired = arg.required;
          const showHelp = expandedHelp[arg.name];

          return (
            <div key={arg.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor={inputId} style={{ fontSize: '0.75em', opacity: 0.9, display: 'flex', alignItems: 'center' }}>
                      {arg.name}
                      {isRequired && <span style={{ color: '#f44336', marginLeft: '2px' }}>*</span>}
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
                       style={{ alignSelf: 'flex-start' }}
                   />
              ) : arg.type === 'enum' && arg.options ? (
                   <select
                       id={inputId}
                       className="nodrag"
                       value={args[arg.name] || ''}
                       onChange={(e) => handleArgChange(arg.name, e.target.value)}
                       style={{
                           width: '100%',
                           background: 'var(--vscode-input-background)',
                           color: 'var(--vscode-input-foreground)',
                           border: '1px solid var(--vscode-input-border)',
                           padding: '4px'
                       }}
                   >
                       <option value="">(Select)</option>
                       {arg.options.map((opt: string) => (
                           <option key={opt} value={opt}>{opt}</option>
                       ))}
                   </select>
              ) : (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      id={inputId}
                      className="nodrag"
                      type="text"
                      value={args[arg.name] || ''}
                      onChange={(e) => handleArgChange(arg.name, e.target.value)}
                      placeholder={arg.default ? `${arg.default} (default)` : ''}
                      style={{
                        flex: 1,
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '4px',
                        fontSize: '0.9em'
                      }}
                    />
                    <button
                      className="nodrag"
                      onClick={() => insertVariable(arg.name)}
                      title="Insert Input Variable"
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
                  </div>
              )}
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(ActionNode);

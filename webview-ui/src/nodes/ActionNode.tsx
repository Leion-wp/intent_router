import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// Definitions of capabilities and their arguments
const CAPABILITIES: Record<string, { label: string; args: string[] }[]> = {
  terminal: [
    { label: 'run', args: ['command', 'description'] }
  ],
  system: [
    { label: 'pause', args: ['message', 'description'] }
  ],
  git: [
    { label: 'checkout', args: ['branch', 'description'] },
    { label: 'commit', args: ['message', 'description'] },
    { label: 'push', args: ['description'] },
    { label: 'pull', args: ['description'] }
  ],
  docker: [
    { label: 'run', args: ['image', 'command', 'description'] },
    { label: 'build', args: ['path', 'tag', 'description'] }
  ]
};

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: '#007acc', // VS Code Blue
  success: '#4caf50', // Green
  failure: '#f44336'  // Red
};

const ActionNode = ({ data, id }: NodeProps) => {
  const [provider, setProvider] = useState<string>((data.provider as string) || 'terminal');
  const [capability, setCapability] = useState<string>((data.capability as string) || '');
  const [args, setArgs] = useState<Record<string, string>>((data.args as Record<string, string>) || {});
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');

  // Sync from props if data changes externally
  useEffect(() => {
    if (data.provider) setProvider(data.provider as string);
    if (data.capability) setCapability(data.capability as string);
    if (data.args) setArgs(data.args as Record<string, string>);
    if (data.status) setStatus(data.status as string);
  }, [data]);

  // Default capability selection
  useEffect(() => {
    if (!capability && CAPABILITIES[provider]) {
       const defaultCap = CAPABILITIES[provider][0].label;
       setCapability(defaultCap);
       updateData(provider, defaultCap, args);
    }
  }, [provider]);

  const updateData = (p: string, c: string, a: any) => {
    // We mutate the data object directly because ReactFlow uses it by reference,
    // but a cleaner way in a real app would be using useReactFlow().setNodes(...)
    data.provider = p;
    data.capability = c;
    data.args = a;
  };

  const handleArgChange = (key: string, value: string) => {
    const newArgs = { ...args, [key]: value };
    setArgs(newArgs);
    updateData(provider, capability, newArgs);
  };

  const insertVariable = (key: string) => {
    // Simple helper to append variable syntax
    const current = args[key] || '';
    handleArgChange(key, current + '${input:Prompt}');
  };

  const currentCaps = CAPABILITIES[provider] || [];
  const currentArgs = currentCaps.find(c => c.label === capability)?.args || [];

  const isPause = provider === 'system' && capability === 'pause';
  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;

  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: `2px solid ${isPause ? '#e6c300' : borderColor}`, // Gold for pause
      boxShadow: status === 'running' ? `0 0 10px ${borderColor}` : 'none',
      minWidth: '200px',
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
          value={capability}
          onChange={(e) => {
            setCapability(e.target.value);
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
          {currentCaps.map(c => (
            <option key={c.label} value={c.label}>{c.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {currentArgs.map(arg => {
          const inputId = `input-${id}-${arg}`;
          return (
            <div key={arg} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label htmlFor={inputId} style={{ fontSize: '0.7em', opacity: 0.8 }}>{arg}</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  id={inputId}
                  className="nodrag"
                  type="text"
                  value={args[arg] || ''}
                  onChange={(e) => handleArgChange(arg, e.target.value)}
                  placeholder={arg}
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
                  onClick={() => insertVariable(arg)}
                  title="Insert Input Variable"
                  aria-label={`Insert variable for ${arg}`}
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
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(ActionNode);

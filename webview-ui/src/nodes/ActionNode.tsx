import { memo, useMemo, useState, useEffect, useContext, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext, RegistryContext } from '../App';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import SchemaArgsForm from '../components/SchemaArgsForm';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: '#888',
  running: '#f2c94c',
  success: '#4caf50',
  failure: '#f44336',
  error: '#f44336'
};

const PROVIDER_THEMES: Record<string, { color: string, icon: string }> = {
  terminal: { color: '#007acc', icon: 'terminal' },
  git: { color: '#f05032', icon: 'source-control' },
  docker: { color: '#2496ed', icon: 'container' },
  system: { color: '#6a737d', icon: 'settings-gear' },
  vscode: { color: '#007acc', icon: 'vscode' },
  default: { color: '#8a2be2', icon: 'gear' }
};

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
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!data.collapsed;

  useEffect(() => {
    if (data.provider) setProvider(data.provider as string);
    if (data.capability) setCapability(data.capability as string);
    if (data.args) setArgs(data.args as Record<string, any>);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || '');

    if (data.logs && (data.logs as any[]).length > 0 && !isConsoleOpen) {
        setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = (data.logs as any[]) || [];

  useEffect(() => {
    if (isConsoleOpen && logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isConsoleOpen]);

  const currentProviderGroup = commandGroups?.find((g: any) => g.provider === provider);
  const currentCaps = currentProviderGroup?.commands || [];

  const handleArgChange = (key: string, value: any) => {
    const newArgs = { ...args, [key]: value };
    setArgs(newArgs);
    updateNodeData(id, { args: newArgs });
  };

  const availableVars = useMemo(() => {
    try { return getAvailableVars(); } catch { return []; }
  }, [getAvailableVars]);

  let selectedCapConfig = currentCaps.find((c: any) => c.capability === capability);
  if (!selectedCapConfig && capability) {
      selectedCapConfig = currentCaps.find((c: any) => c.capability.endsWith(`.${capability}`));
  }

  const schemaArgs = selectedCapConfig?.args || [];
  const displayArgs = [
     ...schemaArgs,
     { name: 'description', type: 'string', description: 'Step description for logs' }
  ];

  const inputHandles = useMemo(() => {
    const names = (Array.isArray(schemaArgs) ? schemaArgs : [])
      .map((arg: any) => String(arg?.name || '').trim())
      .filter((name: string) => name.length > 0);
    return ['in', ...names];
  }, [schemaArgs]);

  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 24;
    const max = 82;
    return `${min + ((max - min) * index) / (total - 1)}%`;
  };

  const theme = PROVIDER_THEMES[provider] || PROVIDER_THEMES.default;
  const isRunning = status === 'running';
  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || theme.color;

  const handleStyle = {
    width: '10px',
    height: '10px',
    border: '2px solid rgba(30, 30, 35, 0.85)',
    boxShadow: '0 0 5px rgba(0,0,0,0.4)',
    zIndex: 10
  };

  return (
    <div style={{
      position: 'relative',
      padding: '0px',
      borderRadius: '12px',
      background: 'rgba(30, 30, 35, 0.85)',
      backdropFilter: 'blur(12px)',
      border: `1.5px solid ${isRunning ? theme.color : 'rgba(255, 255, 255, 0.15)'}`,
      boxShadow: isRunning 
        ? `0 0 20px ${theme.color}66` 
        : `0 8px 32px rgba(0, 0, 0, 0.45)`,
      minWidth: '280px',
      color: '#e0e0e0',
      fontFamily: 'var(--vscode-font-family)',
      transition: 'all 0.3s ease'
    }}>
      {/* Target Handles */}
      {inputHandles.map((inputName, index) => (
        <Handle
          key={index}
          type="target"
          position={Position.Left}
          id={inputName === 'in' ? 'in' : `in_${inputName}`}
          style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: theme.color }}
        />
      ))}
      
      {/* Source Handles */}
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, top: '30%', right: '-5px', background: '#f44336' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-5px', background: '#4caf50' }} />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ 
          padding: '10px 12px', 
          background: `${theme.color}22`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: theme.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className={`codicon codicon-${theme.icon}`} style={{ color: '#fff', fontSize: '14px' }}></span>
            </div>
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => { setLabel(e.target.value); updateNodeData(id, { label: e.target.value }); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '2px 6px', fontSize: '13px' }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} style={{ fontSize: '12px', letterSpacing: '0.4px', cursor: 'pointer' }}>
                {label || `${provider.toUpperCase()} ACTION`}
              </span>
            )}
          </div>
          <button
            className="nodrag"
            onClick={() => updateNodeData(id, { collapsed: !collapsed })}
            style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`}></span>
          </button>
        </div>

        {!collapsed && (
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ marginBottom: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Capability</label>
                <select
                    className="nodrag"
                    value={selectedCapConfig?.capability || capability}
                    onChange={(e) => updateNodeData(id, { capability: e.target.value })}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', color: '#ccc', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                >
                    {currentCaps.map((c: any) => (
                        <option key={c.capability} value={c.capability}>{c.capability.split('.').pop()}</option>
                    ))}
                </select>
            </div>

            <SchemaArgsForm nodeId={id} fields={displayArgs as any} values={args} onChange={handleArgChange} availableVars={availableVars} />
          </div>
        )}
      </div>

      {!collapsed && logs.length > 0 && (
        <div className="nodrag" style={{ padding: '0 10px 10px 10px' }}>
            <div
                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                style={{ fontSize: '10px', padding: '4px 8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', color: '#777', borderRadius: '4px' }}
            >
                <span>LOGS ({logs.length})</span>
                <span className={`codicon codicon-chevron-${isConsoleOpen ? 'up' : 'down'}`} style={{ fontSize: '10px' }}></span>
            </div>
            {isConsoleOpen && (
                <div
                    ref={logsRef}
                    style={{ maxHeight: '120px', overflowY: 'auto', background: '#050505', color: '#bbb', padding: '8px', fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginTop: '4px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                    {logs.map((log: any, i: number) => (
                        <div key={i} style={{ color: log.stream === 'stderr' ? '#f44336' : 'inherit', marginBottom: '2px' }}>{log.text}</div>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default memo(ActionNode);

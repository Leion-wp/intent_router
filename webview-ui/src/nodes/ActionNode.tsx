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

function parseCronIntervalMs(args: Record<string, any>): number | null {
  const intervalMs = Number(args?.intervalMs);
  if (Number.isFinite(intervalMs) && intervalMs > 0) return Math.floor(intervalMs);

  const everyMinutes = Number(args?.everyMinutes);
  if (Number.isFinite(everyMinutes) && everyMinutes > 0) return Math.floor(everyMinutes * 60_000);

  const everyHours = Number(args?.everyHours);
  if (Number.isFinite(everyHours) && everyHours > 0) return Math.floor(everyHours * 60 * 60_000);

  const cron = String(args?.cron || '').trim();
  const minuteMatch = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (minuteMatch) return Math.max(1, Number(minuteMatch[1])) * 60_000;
  const hourMatch = cron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (hourMatch) return Math.max(1, Number(hourMatch[1])) * 60 * 60_000;

  return null;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ActionNode = ({ data, id }: NodeProps) => {
  const { commandGroups } = useContext(RegistryContext);
  const { getAvailableVars, isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  
  const [provider, setProvider] = useState<string>((data.provider as string) || 'terminal');
  const [capability, setCapability] = useState<string>((data.capability as string) || '');
  const [args, setArgs] = useState<Record<string, any>>((data.args as Record<string, any>) || {});
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [nowTick, setNowTick] = useState<number>(Date.now());
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
  const cronIntervalMs = useMemo(
    () => (capability === 'system.trigger.cron' ? parseCronIntervalMs(args || {}) : null),
    [capability, args]
  );
  const cronEnabled = String((args as any)?.enabled ?? 'true').toLowerCase() !== 'false';
  const initialCronAnchorRef = useRef<number>(Date.now());

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

  useEffect(() => {
    if (!currentCaps.length) return;
    if (!capability) {
      const nextCapability = String(currentCaps[0]?.capability || '').trim();
      if (!nextCapability) return;
      setCapability(nextCapability);
      updateNodeData(id, { provider, capability: nextCapability });
      return;
    }
    if (!selectedCapConfig) {
      const nextCapability = String(currentCaps[0]?.capability || '').trim();
      if (!nextCapability || nextCapability === capability) return;
      setCapability(nextCapability);
      updateNodeData(id, { provider, capability: nextCapability });
    }
  }, [currentCaps, capability, selectedCapConfig, id, provider, updateNodeData]);

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
  const themeColor = theme.color;
  const isRunning = status === 'running';
  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || themeColor;
  const cronCountdownLabel = useMemo(() => {
    if (capability !== 'system.trigger.cron' || !cronEnabled || !cronIntervalMs || cronIntervalMs <= 0) return '';
    const elapsed = (nowTick - initialCronAnchorRef.current) % cronIntervalMs;
    const remaining = cronIntervalMs - elapsed;
    return formatCountdown(remaining);
  }, [capability, cronEnabled, cronIntervalMs, nowTick]);

  useEffect(() => {
    if (capability !== 'system.trigger.cron' || !cronEnabled || !cronIntervalMs || cronIntervalMs <= 0) {
      return;
    }
    const handle = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [capability, cronEnabled, cronIntervalMs]);

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '280px' }}>
      {/* Target Handles */}
      {inputHandles.map((inputName, index) => (
        <Handle
          key={index}
          type="target"
          position={Position.Left}
          id={inputName === 'in' ? 'in' : `in_${inputName}`}
          style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-6px', background: theme.color }}
        />
      ))}
      
      {/* Source Handles */}
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, top: '30%', right: '-6px', background: '#ff4d4d' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-6px', background: '#00ff88' }} />

      <div>
        {/* Header */}
        <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}15 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${theme.color} 0%, ${theme.color}cc 100%)` }}>
              <span className={`codicon codicon-${theme.icon}`} style={{ color: '#fff', fontSize: '16px' }}></span>
            </div>
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => { setLabel(e.target.value); updateNodeData(id, { label: e.target.value }); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
                style={{ width: '100%' }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} className="glass-node-label">
                {label || `${provider.toUpperCase()} ACTION`}
                {cronCountdownLabel ? ` (${cronCountdownLabel})` : ''}
              </span>
            )}
          </div>
          <button
            className="nodrag"
            onClick={() => updateNodeData(id, { collapsed: !collapsed })}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: 'none', 
              color: '#aaa', 
              cursor: 'pointer',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: '12px' }}></span>
          </button>
        </div>

        {!collapsed && (
          <div className="glass-node-body">
            <div className="glass-node-input-group">
                <label className="glass-node-input-label">Capability</label>
                <select
                    className="nodrag"
                    value={selectedCapConfig?.capability || capability}
                    onChange={(e) => {
                      const nextCapability = e.target.value;
                      setCapability(nextCapability);
                      updateNodeData(id, { capability: nextCapability });
                    }}
                >
                    {currentCaps.map((c: any) => (
                        <option
                          key={c.capability}
                          value={c.capability}
                          style={{ background: '#1a1a20' }}
                        >
                          {c.capability.split('.').pop()}
                        </option>
                    ))}
                </select>
            </div>

            <SchemaArgsForm nodeId={id} fields={displayArgs as any} values={args} onChange={handleArgChange} availableVars={availableVars} />
          </div>
        )}
      </div>

      {!collapsed && logs.length > 0 && (
        <div className="nodrag" style={{ padding: '0 16px 16px 16px' }}>
            <div
                onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                style={{ 
                  fontSize: '10px', 
                  fontWeight: 600,
                  padding: '6px 10px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  background: 'rgba(255,255,255,0.03)', 
                  color: 'rgba(255,255,255,0.5)', 
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.2s ease'
                }}
            >
                <span>LOGS ({logs.length})</span>
                <span className={`codicon codicon-chevron-${isConsoleOpen ? 'up' : 'down'}`} style={{ fontSize: '10px' }}></span>
            </div>
            {isConsoleOpen && (
                <div
                    ref={logsRef}
                    style={{ 
                      maxHeight: '140px', 
                      overflowY: 'auto', 
                      background: 'rgba(0,0,0,0.3)', 
                      color: 'rgba(255,255,255,0.7)', 
                      padding: '10px', 
                      fontSize: '11px', 
                      fontFamily: 'monospace', 
                      whiteSpace: 'pre-wrap', 
                      marginTop: '8px', 
                      borderRadius: '8px', 
                      border: '1px solid rgba(255,255,255,0.05)',
                      lineHeight: '1.4'
                    }}
                >
                    {logs.map((log: any, i: number) => (
                        <div key={i} style={{ color: log.stream === 'stderr' ? '#ff4d4d' : 'inherit', marginBottom: '4px' }}>{log.text}</div>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default memo(ActionNode);

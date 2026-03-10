import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CustomNodesContext, FlowEditorContext, FlowRuntimeContext, RegistryContext } from '../App';
import SchemaArgsForm, { SchemaField } from '../components/SchemaArgsForm';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
};

const CustomNode = ({ data, id }: NodeProps) => {
  const { commandGroups } = useContext(RegistryContext);
  const { getAvailableVars, isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getById } = useContext(CustomNodesContext);

  const def = getById(String((data as any)?.customNodeId || ''));
  const snapshotTitle = String((data as any)?.title || '').trim();
  const snapshotIntent = String((data as any)?.intent || '').trim();

  const title = String(def?.title || snapshotTitle || 'Custom').trim();
  const intent = String(def?.intent || snapshotIntent || '').trim();
  const schema = (def?.schema || (data as any)?.schema || []) as SchemaField[];
  const mapping = (def?.mapping || (data as any)?.mapping) as any;

  const [args, setArgs] = useState<Record<string, any>>(((data as any)?.args as Record<string, any>) || {});
  const [status, setStatus] = useState<string>(((data as any)?.status as string) || 'idle');
  const [editingTitle, setEditingTitle] = useState(false);
  const [label, setLabel] = useState<string>(String((data as any)?.label || ''));
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.args) setArgs((data as any).args as Record<string, any>);
    if ((data as any)?.status) setStatus(String((data as any).status));
    if ((data as any)?.label !== undefined) setLabel(String((data as any).label || ''));
    if ((data as any)?.logs && ((data as any).logs as any[]).length > 0 && !isConsoleOpen) {
      setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = ((data as any)?.logs as any[]) || [];

  useEffect(() => {
    if (isConsoleOpen && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isConsoleOpen]);

  const handleArgChange = (key: string, value: any) => {
    const next = { ...args, [key]: value };
    setArgs(next);
    updateNodeData(id, { args: next, title, intent, schema, mapping });
  };

  const availableVars = useMemo(() => {
    try {
      return getAvailableVars();
    } catch {
      return [];
    }
  }, [getAvailableVars]);

  const capabilityConfig = useMemo(() => {
    if (!intent) return undefined;
    for (const g of commandGroups || []) {
      const found = (g?.commands || []).find((c: any) => String(c?.capability || '') === intent);
      if (found) return found;
    }
    return undefined;
  }, [commandGroups, intent]);

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;
  const previewGlow = isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none';

  const displayFields: SchemaField[] = useMemo(() => {
    const base = Array.isArray(schema) ? schema : [];
    return [...base, { name: 'description', type: 'string', description: 'Step description for logs' }];
  }, [schema]);
  const ioInputs = useMemo(() => {
    const fields = Array.isArray(schema) ? schema : [];
    const names = fields.map((field: any) => {
      const name = String(field?.name || '').trim();
      if (!name) return '';
      return field?.required ? `${name}*` : name;
    }).filter(Boolean);
    return names.length ? names : ['payload'];
  }, [schema]);
  const ioOutputs = ['success', 'error'];
  const inputHandles = useMemo(() => {
    const names = (Array.isArray(schema) ? schema : [])
      .map((field: any) => String(field?.name || '').trim())
      .filter((name: string) => name.length > 0);
    return ['in', ...names];
  }, [schema]);

  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 24;
    const max = 82;
    const value = min + ((max - min) * index) / (total - 1);
    return `${value}%`;
  };

  const handleStyle = {
    width: '10px',
    height: '10px',
    border: '2px solid rgba(30, 30, 35, 0.85)',
    boxShadow: '0 0 5px rgba(0,0,0,0.4)',
    zIndex: 10
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '0px',
        borderRadius: '12px',
        background: 'rgba(30, 30, 35, 0.85)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${status === 'running' ? '#d4d4d4' : 'rgba(255, 255, 255, 0.2)'}`,
        boxShadow: status === 'running' ? `0 0 20px rgba(255, 255, 255, 0.2)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
        minWidth: '280px',
        color: '#e0e0e0',
        fontFamily: 'var(--vscode-font-family)',
        transition: 'all 0.3s ease'
      }}
    >
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: '#d4d4d4' }}
          />
        </div>
      ))}
      <Handle
        type="source"
        position={Position.Right}
        id="failure"
        title="On Failure"
        style={{ ...handleStyle, top: '30%', right: '-5px', background: 'var(--ir-status-error)' }}
      />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(255, 255, 255, 0.1)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#666',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-symbol-structure" style={{ color: '#fff', fontSize: '14px' }}></span>
            </div>
            {editingTitle ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                placeholder={title}
                onChange={(e) => {
                  const v = e.target.value;
                  setLabel(v);
                  updateNodeData(id, { label: v });
                }}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false); }}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '13px'
                }}
              />
            ) : (
              <span onClick={() => setEditingTitle(true)} style={{ fontSize: '13px', letterSpacing: '0.4px', cursor: 'pointer' }}>
                {label || title}
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
            <IoSpec inputs={ioInputs} outputs={ioOutputs} />
            <SchemaArgsForm nodeId={id} fields={displayFields} values={args} onChange={handleArgChange} availableVars={availableVars} />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-5px', background: '#d4d4d4' }} />

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
              background: 'rgba(0,0,0,0.2)',
              opacity: 0.8
            }}
          >
            <span>Output ({logs.length})</span>
            <span>{isConsoleOpen ? '▼' : '▶'}</span>
          </div>
          {isConsoleOpen && (
            <div
              ref={logsRef}
              style={{
                maxHeight: '150px',
                overflowY: 'auto',
                background: '#1e1e1e',
                color: '#cccccc',
                padding: '4px',
                fontSize: '0.75em',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                borderBottomLeftRadius: '4px',
                borderBottomRightRadius: '4px'
              }}
            >
              {logs.map((log: any, i: number) => (
                <div key={i} style={{ color: log.stream === 'stderr' ? 'var(--ir-status-error)' : 'inherit', display: 'block' }}>
                  {log.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(CustomNode);

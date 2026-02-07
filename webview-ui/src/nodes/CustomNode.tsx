import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { CustomNodesContext, FlowEditorContext, FlowRuntimeContext, RegistryContext } from '../App';
import SchemaArgsForm, { SchemaField } from '../components/SchemaArgsForm';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)'
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

  const determinism: 'deterministic' | 'interactive' =
    capabilityConfig?.determinism === 'interactive' ? 'interactive' : 'deterministic';
  const determinismBadge = determinism === 'interactive' ? '👤' : '⚙';

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

  return (
    <div
      style={{
        position: 'relative',
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: `2px solid ${borderColor}`,
        boxShadow: status === 'running' ? `0 0 10px ${borderColor}, ${previewGlow}` : previewGlow,
        minWidth: '250px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ top: handleTop(index, inputHandles.length) }}
          />
          <span
            style={{
              position: 'absolute',
              left: '-2px',
              top: handleTop(index, inputHandles.length),
              transform: 'translate(-100%, -50%)',
              fontSize: '10px',
              opacity: inputName === 'in' ? 0.8 : 0.65,
              whiteSpace: 'nowrap'
            }}
          >
            {inputName}
          </span>
        </div>
      ))}
      <Handle
        type="source"
        position={Position.Right}
        id="failure"
        title="On Failure"
        style={{ top: '30%', background: 'var(--ir-status-error)' }}
      />
      <span style={{ position: 'absolute', right: '-2px', top: '30%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>error</span>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 'bold', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="codicon codicon-symbol-structure"></span>
          <span
            title={determinism === 'interactive' ? 'Interactive (requires human / UI)' : 'Deterministic'}
            style={{ fontSize: '12px', opacity: determinism === 'interactive' ? 1 : 0.85 }}
          >
            {determinismBadge}
          </span>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingTitle(false);
              }}
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '2px 4px',
                fontSize: '0.9em'
              }}
            />
          ) : (
            <div
              onDoubleClick={() => setEditingTitle(true)}
              title="Double-click to rename"
              style={{ flex: 1, cursor: 'text', userSelect: 'none' }}
            >
              {label || title}
            </div>
          )}
        </div>
        {intent && (
          <div style={{ fontSize: '11px', opacity: 0.75, whiteSpace: 'nowrap' }} title={intent}>
            {intent}
          </div>
        )}
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
          <IoSpec inputs={ioInputs} outputs={ioOutputs} />
          <SchemaArgsForm nodeId={id} fields={displayFields} values={args} onChange={handleArgChange} availableVars={availableVars} />
        </>
      )}

      <Handle type="source" position={Position.Right} id="success" />
      <span style={{ position: 'absolute', right: '-2px', top: '50%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>success</span>

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

export default memo(CustomNode);

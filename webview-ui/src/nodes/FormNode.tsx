import { memo, useContext, useEffect, useRef, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';
import IoSpec from '../components/IoSpec';

type FieldType = 'text' | 'textarea' | 'select' | 'checkbox';

export type FormField = {
  type: FieldType;
  label: string;
  key: string;
  required?: boolean;
  default?: string;
  options?: string; // comma-separated (select)
  secret?: boolean;
};

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)'
};

const FormNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const [fields, setFields] = useState<FormField[]>(Array.isArray((data as any)?.fields) ? ((data as any).fields as any[]) : []);
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const [collapsed, setCollapsed] = useState<boolean>(!!(data as any)?.collapsed);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Array.isArray((data as any)?.fields)) setFields((data as any).fields);
    if ((data as any)?.status) setStatus(String((data as any).status));
    if (typeof (data as any)?.collapsed === 'boolean') setCollapsed(!!(data as any).collapsed);
    if ((data as any)?.logs && ((data as any).logs as any[]).length > 0 && !isConsoleOpen) {
      setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = (((data as any)?.logs as any[]) || []) as any[];

  useEffect(() => {
    if (isConsoleOpen && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isConsoleOpen]);

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;
  const inputHandles = ['in', ...fields.map((field) => String(field.key || field.label || 'field').trim()).filter((name) => name.length > 0)];
  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 22;
    const max = 84;
    const value = min + ((max - min) * index) / (total - 1);
    return `${value}%`;
  };

  const updateField = (index: number, patch: Partial<FormField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    setFields(next);
    updateNodeData(id, { fields: next });
  };

  const addField = () => {
    const next = [...fields, { type: 'text', label: 'Field', key: '', required: false, default: '' } as FormField];
    setFields(next);
    updateNodeData(id, { fields: next });
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index);
    setFields(next);
    updateNodeData(id, { fields: next });
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: `2px solid ${borderColor}`,
        minWidth: '280px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}-${index}`}>
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
      <Handle type="source" position={Position.Right} id="success" />
      <span style={{ position: 'absolute', right: '-2px', top: '50%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>success</span>
      <Handle type="source" position={Position.Right} id="out_values" style={{ top: '76%', background: '#ff9800' }} />
      <span style={{ position: 'absolute', right: '-2px', top: '76%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap' }}>values</span>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
          <span className="codicon codicon-list-selection"></span>
          <span>Form</span>
        </div>
        <button
          className="nodrag"
          onClick={() => {
            setCollapsed((v) => !v);
            updateNodeData(id, { collapsed: !collapsed });
          }}
          style={{
            background: 'none',
            border: '1px solid var(--vscode-panel-border)',
            color: 'var(--vscode-foreground)',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '11px',
            padding: '2px 6px'
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <IoSpec
            inputs={fields.length ? fields.map((field) => `${String(field.key || field.label || 'field')}${field.required ? '*' : ''}`) : ['form values']}
            outputs={fields.length ? fields.map((field) => String(field.key || field.label || 'field')) : ['vars']}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {fields.length === 0 && (
              <div style={{ fontSize: '11px', opacity: 0.7 }}>No fields yet. Add one below.</div>
            )}
            {fields.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', padding: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 24px', gap: '6px', alignItems: 'center' }}>
                  <input
                    className="nodrag"
                    placeholder="label"
                    value={String(f.label || '')}
                    onChange={(e) => updateField(i, { label: e.target.value })}
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
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  >
                    <option value="text">text</option>
                    <option value="textarea">textarea</option>
                    <option value="select">select</option>
                    <option value="checkbox">checkbox</option>
                  </select>
                  <button
                    className="nodrag"
                    onClick={() => removeField(i)}
                    title="Remove"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                  <input
                    className="nodrag"
                    placeholder="key (var name)"
                    value={String(f.key || '')}
                    onChange={(e) => updateField(i, { key: e.target.value })}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    className="nodrag"
                    placeholder="default"
                    value={String(f.default || '')}
                    onChange={(e) => updateField(i, { default: e.target.value })}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                </div>

                {f.type === 'select' && (
                  <input
                    className="nodrag"
                    placeholder="options (comma-separated)"
                    value={String(f.options || '')}
                    onChange={(e) => updateField(i, { options: e.target.value })}
                    style={{
                      marginTop: '6px',
                      width: '100%',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', opacity: 0.9 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      className="nodrag"
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    required
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      className="nodrag"
                      type="checkbox"
                      checked={!!f.secret}
                      onChange={(e) => updateField(i, { secret: e.target.checked })}
                    />
                    secret
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            className="nodrag"
            onClick={addField}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '6px',
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            + Add Field
          </button>
        </>
      )}

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

export default memo(FormNode);

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
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
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
        border: `1.5px solid ${status === 'running' ? '#4caf50' : 'rgba(76, 175, 80, 0.4)'}`,
        boxShadow: status === 'running' ? `0 0 20px rgba(76, 175, 80, 0.4)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
        minWidth: '300px',
        color: '#e0e0e0',
        fontFamily: 'var(--vscode-font-family)',
        transition: 'all 0.3s ease'
      }}
    >
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}-${index}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: '#4caf50' }}
          />
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-5px', background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="out_values" style={{ ...handleStyle, top: '76%', right: '-5px', background: '#ff9800' }} />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(76, 175, 80, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#4caf50',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-list-selection" style={{ color: '#fff', fontSize: '14px' }}></span>
            </div>
            <span style={{ fontSize: '13px', letterSpacing: '0.4px' }}>FORM</span>
          </div>
          <button
            className="nodrag"
            onClick={() => {
              setCollapsed((v) => !v);
              updateNodeData(id, { collapsed: !collapsed });
            }}
            style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`}></span>
          </button>
        </div>

        {!collapsed && (
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Fields</label>
              <button
                className="nodrag"
                onClick={addField}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}
              >
                + Add Field
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fields.length === 0 && <div style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', padding: '10px' }}>No fields defined.</div>}
              {fields.map((f, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: '6px', marginBottom: '6px' }}>
                    <input
                      className="nodrag"
                      placeholder="Label"
                      value={String(f.label || '')}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px' }}
                    />
                    <select
                      className="nodrag"
                      value={f.type}
                      onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                      style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px' }}
                    >
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="select">select</option>
                      <option value="checkbox">checkbox</option>
                    </select>
                    <button
                      className="nodrag"
                      onClick={() => removeField(i)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f44336' }}
                    >
                      ×
                    </button>
                  </div>
                  <input
                    className="nodrag"
                    placeholder="Key (variable name)"
                    value={String(f.key || '')}
                    onChange={(e) => updateField(i, { key: e.target.value })}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(FormNode);

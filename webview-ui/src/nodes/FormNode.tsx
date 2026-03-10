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

  const isRunning = status === 'running';
  const themeColor = '#4caf50';

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '300px' }}>
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}-${index}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-6px', background: themeColor }}
          />
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-6px', background: themeColor }} />
      <Handle type="source" position={Position.Right} id="out_values" style={{ ...handleStyle, top: '76%', right: '-6px', background: '#ff9800' }} />

      <div>
        <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}15 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #45b39d 100%)` }}>
              <span className="codicon codicon-list-selection" style={{ color: '#fff', fontSize: '16px' }}></span>
            </div>
            <span className="glass-node-label">USER FORM</span>
          </div>
          <button
            className="nodrag"
            onClick={() => {
              setCollapsed((v) => !v);
              updateNodeData(id, { collapsed: !collapsed });
            }}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="glass-node-input-label">Form Fields</label>
              <button
                className="nodrag"
                onClick={addField}
                style={{
                  background: 'var(--ir-accent-primary)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 10px rgba(0, 162, 255, 0.2)'
                }}
              >
                + Add Field
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fields.length === 0 && <div style={{ fontSize: '12px', opacity: 0.3, textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)' }}>No fields defined.</div>}
              {fields.map((f, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      className="nodrag"
                      placeholder="Label"
                      value={String(f.label || '')}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      style={{ fontSize: '11px', padding: '6px 10px' }}
                    />
                    <select
                      className="nodrag"
                      value={f.type}
                      onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                      style={{ fontSize: '11px', padding: '6px' }}
                    >
                      <option value="text" style={{ background: '#1a1a20' }}>text</option>
                      <option value="textarea" style={{ background: '#1a1a20' }}>textarea</option>
                      <option value="select" style={{ background: '#1a1a20' }}>select</option>
                      <option value="checkbox" style={{ background: '#1a1a20' }}>checkbox</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      className="nodrag"
                      placeholder="Key (variable name)"
                      value={String(f.key || '')}
                      onChange={(e) => updateField(i, { key: e.target.value })}
                      style={{ flex: 1, fontSize: '11px', padding: '6px 10px' }}
                    />
                    <button
                      className="nodrag"
                      onClick={() => removeField(i)}
                      style={{ 
                        background: 'rgba(255, 77, 77, 0.1)', 
                        border: 'none', 
                        cursor: 'pointer', 
                        color: '#ff4d4d', 
                        borderRadius: '6px',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <span className="codicon codicon-trash" style={{ fontSize: '14px' }}></span>
                    </button>
                  </div>
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

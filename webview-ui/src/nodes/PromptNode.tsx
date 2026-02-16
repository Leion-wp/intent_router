import { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: 'var(--vscode-charts-purple)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
} as const;

const PromptNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [name, setName] = useState<string>((data.name as string) || '');
  const [defaultValue, setDefaultValue] = useState<string>((data.value as string) || '');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [status, setStatus] = useState<string>(String((data.status as string) || 'idle'));
  const [editingLabel, setEditingLabel] = useState(false);
  const collapsed = !!data.collapsed;
  const inputHandles = ['in', 'name', 'default'];
  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 26;
    const max = 78;
    const value = min + ((max - min) * index) / (total - 1);
    return `${value}%`;
  };

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextName = (data.name as string) || '';
    const nextValue = (data.value as string) || '';
    if (nextName !== name) setName(nextName);
    if (nextValue !== defaultValue) setDefaultValue(nextValue);
    if (data.label !== undefined) setLabel((data.label as string) || '');
    setStatus(String((data.status as string) || 'idle'));
  }, [data.name, data.value, data.label, data.status]);

  // Ensure kind is set
  useEffect(() => {
    if (data.kind !== 'prompt') {
      data.kind = 'prompt';
    }
  }, []);

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;
  const runningGlow = status === 'running' ? `0 0 10px ${borderColor}` : '';
  const previewGlow = isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : '';
  const boxShadow = [runningGlow, previewGlow].filter(Boolean).join(', ') || 'none';

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
      border: `1.5px solid ${status === 'running' ? '#ff00ff' : 'rgba(255, 0, 255, 0.4)'}`,
      boxShadow: status === 'running' ? `0 0 20px rgba(255, 0, 255, 0.4)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
      minWidth: '280px',
      color: '#e0e0e0',
      fontFamily: 'var(--vscode-font-family)',
      transition: 'all 0.3s ease'
    }}>
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: '#ff00ff' }}
          />
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-5px', background: '#ff00ff' }} />
      <Handle type="source" position={Position.Right} id="out_value" style={{ ...handleStyle, top: '74%', right: '-5px', background: '#7e57c2' }} />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(255, 0, 255, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#ff00ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-symbol-string" style={{ color: '#fff', fontSize: '14px' }}></span>
            </div>
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => { setLabel(e.target.value); updateNodeData(id, { label: e.target.value }); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
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
              <span onClick={() => setEditingLabel(true)} style={{ fontSize: '13px', letterSpacing: '0.4px', cursor: 'pointer' }}>
                {label || 'Prompt / Set Var'}
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
            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Variable Name</label>
              <input
                className="nodrag"
                type="text"
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  updateNodeData(id, { name: v });
                }}
                placeholder="e.g. branchName"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  padding: '6px',
                  fontSize: '11px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Default Value</label>
              <input
                className="nodrag"
                type="text"
                value={defaultValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setDefaultValue(v);
                  updateNodeData(id, { value: v });
                }}
                placeholder="Default value"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  padding: '6px',
                  fontSize: '11px'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(PromptNode);

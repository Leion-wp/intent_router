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

  const isRunning = status === 'running';
  const themeColor = '#ff00ff';

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
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-6px', background: themeColor }}
          />
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-6px', background: themeColor }} />
      <Handle type="source" position={Position.Right} id="out_value" style={{ ...handleStyle, top: '74%', right: '-6px', background: '#7e57c2' }} />

      <div>
        <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}15 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #e000e0 100%)` }}>
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
                style={{ width: '100%' }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} className="glass-node-label">
                {label || 'Prompt / Set Var'}
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
              <label className="glass-node-input-label">Variable Name</label>
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
              />
            </div>

            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Default Value</label>
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
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(PromptNode);

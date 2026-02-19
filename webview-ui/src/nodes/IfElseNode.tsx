import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

type IfCondition = 'equals' | 'exists' | 'contains' | 'regex';

const normalizeCondition = (value: unknown): IfCondition => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'exists' || candidate === 'contains' || candidate === 'regex') {
    return candidate;
  }
  return 'equals';
};

const isValidRegex = (pattern: string): boolean => {
  if (!pattern) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const IfElseNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars } = useContext(FlowRuntimeContext);
  const [label, setLabel] = useState<string>(String((data as any)?.label || 'If / Else'));
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const [variableKey, setVariableKey] = useState<string>(String((data as any)?.variableKey || ''));
  const [condition, setCondition] = useState<IfCondition>(normalizeCondition((data as any)?.condition));
  const [value, setValue] = useState<string>(String((data as any)?.value || ''));
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.label !== undefined) setLabel(String((data as any)?.label || 'If / Else'));
    if ((data as any)?.variableKey !== undefined) setVariableKey(String((data as any)?.variableKey || ''));
    if ((data as any)?.condition !== undefined) setCondition(normalizeCondition((data as any)?.condition));
    if ((data as any)?.value !== undefined) setValue(String((data as any)?.value || ''));
    if ((data as any)?.status !== undefined) setStatus(String((data as any)?.status || 'idle'));
  }, [data]);

  const availableVars = useMemo(() => {
    try {
      return getAvailableVars();
    } catch {
      return [];
    }
  }, [getAvailableVars]);

  const isRunning = status === 'running';
  const themeColor = '#5fb3ff';
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
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-6px', background: themeColor }} />
      <Handle type="source" position={Position.Right} id="true" style={{ ...handleStyle, top: '38%', right: '-6px', background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="false" style={{ ...handleStyle, top: '72%', right: '-6px', background: '#f44336' }} />

      <div style={{ position: 'absolute', right: '12px', top: '38%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, opacity: 0.55, pointerEvents: 'none', textTransform: 'uppercase' }}>
        true
      </div>
      <div style={{ position: 'absolute', right: '12px', top: '72%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, opacity: 0.55, pointerEvents: 'none', textTransform: 'uppercase' }}>
        false
      </div>

      <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}20 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #4a90e2 100%)` }}>
            <span className="codicon codicon-git-compare" style={{ color: '#fff', fontSize: '16px' }}></span>
          </div>
          {editingLabel ? (
            <input
              className="nodrag"
              value={label}
              autoFocus
              onChange={(e) => { const next = e.target.value; setLabel(next); updateNodeData(id, { label: next }); }}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
              style={{ width: '100%' }}
            />
          ) : (
            <span onClick={() => setEditingLabel(true)} className="glass-node-label">{label || 'If / Else'}</span>
          )}
        </div>
        <button
          className="nodrag"
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#aaa', cursor: 'pointer', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: '12px' }}></span>
        </button>
      </div>

      {!collapsed && (
        <div className="glass-node-body">
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Variable key</label>
            <input
              className="nodrag"
              list={`if-vars-${id}`}
              value={variableKey}
              onChange={(e) => { const next = e.target.value; setVariableKey(next); updateNodeData(id, { variableKey: next }); }}
              placeholder="mode"
            />
            <datalist id={`if-vars-${id}`}>
              {availableVars.map((entry) => <option key={entry} value={entry} />)}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Condition</label>
              <select
                className="nodrag"
                value={condition}
                onChange={(e) => {
                  const next = normalizeCondition(e.target.value);
                  setCondition(next);
                  updateNodeData(id, { condition: next, ...(next === 'exists' ? { value: '' } : {}) });
                  if (next === 'exists') setValue('');
                }}
              >
                <option value="equals" style={{ background: '#1a1a20' }}>equals</option>
                <option value="exists" style={{ background: '#1a1a20' }}>exists</option>
                <option value="contains" style={{ background: '#1a1a20' }}>contains</option>
                <option value="regex" style={{ background: '#1a1a20' }}>regex</option>
              </select>
            </div>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Value</label>
              <input
                className="nodrag"
                value={value}
                onChange={(e) => { const next = e.target.value; setValue(next); updateNodeData(id, { value: next }); }}
                placeholder="production"
                disabled={condition === 'exists'}
                style={{
                  opacity: condition === 'exists' ? 0.4 : 1,
                  border: condition === 'regex' && String(value || '').trim() && !isValidRegex(String(value || '').trim())
                    ? '1px solid #ff4d4d'
                    : undefined
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(IfElseNode);

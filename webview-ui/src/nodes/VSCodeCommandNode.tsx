import { memo, useEffect, useState, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: 'var(--vscode-charts-blue)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
} as const;

const VSCodeCommandNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [commandId, setCommandId] = useState<string>((data.commandId as string) || '');
  const [argsJson, setArgsJson] = useState<string>((data.argsJson as string) || '');
  const [status, setStatus] = useState<string>(String((data.status as string) || 'idle'));
  const [error, setError] = useState<string>('');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const collapsed = !!data.collapsed;
  const inputHandles = ['in', 'commandId', 'argsJson'];
  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 24;
    const max = 80;
    const value = min + ((max - min) * index) / (total - 1);
    return `${value}%`;
  };

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextCommandId = (data.commandId as string) || '';
    const nextArgsJson = (data.argsJson as string) || '';
    if (nextCommandId !== commandId) setCommandId(nextCommandId);
    if (nextArgsJson !== argsJson) setArgsJson(nextArgsJson);
    if (data.label !== undefined) setLabel((data.label as string) || '');
    setStatus(String((data.status as string) || 'idle'));
  }, [data.commandId, data.argsJson, data.label, data.status]);

  useEffect(() => {
    if (data.kind !== 'vscodeCommand') {
      data.kind = 'vscodeCommand';
    }

    if (!argsJson.trim()) {
      setError('');
      return;
    }

    try {
      JSON.parse(argsJson);
      setError('');
    } catch {
      setError('Invalid JSON');
    }
  }, [commandId, argsJson]);

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
    <div
      style={{
        position: 'relative',
        padding: '0px',
        borderRadius: '12px',
        background: 'rgba(30, 30, 35, 0.85)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${status === 'running' ? '#007acc' : 'rgba(0, 122, 204, 0.4)'}`,
        boxShadow: status === 'running' ? `0 0 20px rgba(0, 122, 204, 0.4)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
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
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: '#007acc' }}
          />
        </div>
      ))}
      <Handle id="success" type="source" position={Position.Right} style={{ ...handleStyle, top: '50%', right: '-5px', background: '#007acc' }} />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(0, 122, 204, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#007acc',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-vscode" style={{ color: '#fff', fontSize: '14px' }}></span>
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
                {label || 'VS Code Command'}
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
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>commandId</label>
              <input
                className="nodrag"
                type="text"
                value={commandId}
                onChange={(e) => {
                  const v = e.target.value;
                  setCommandId(v);
                  updateNodeData(id, { commandId: v });
                }}
                placeholder="e.g. workbench.action.files.save"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>args (JSON)</label>
              <textarea
                className="nodrag"
                value={argsJson}
                onChange={(e) => {
                  const v = e.target.value;
                  setArgsJson(v);
                  updateNodeData(id, { argsJson: v });
                }}
                placeholder='[] or {"foo":"bar"}'
                rows={3}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  border: `1px solid ${error ? '#f44336' : 'rgba(255,255,255,0.1)'}`,
                  padding: '8px',
                  fontFamily: 'Consolas, monospace',
                  fontSize: '11px',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(VSCodeCommandNode);

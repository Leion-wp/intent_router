import { memo, useContext, useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';
import IoSpec from '../components/IoSpec';

const StartNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const [label, setLabel] = useState<string>((data.label as string) || 'My Pipeline');
  const [description, setDescription] = useState<string>((data.description as string) || '');

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextLabel = (data.label as string) || 'My Pipeline';
    const nextDescription = (data.description as string) || '';
    if (nextLabel !== label) setLabel(nextLabel);
    if (nextDescription !== description) setDescription(nextDescription);
  }, [data.label, data.description]);

  // Ensure kind is set
  useEffect(() => {
    if (data.kind !== 'start') {
      data.kind = 'start';
    }
  }, []);

  const themeColor = '#007acc';

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    background: themeColor,
    right: '-6px',
    transition: 'all 0.2s ease'
  };

  return (
    <div className="glass-node" style={{ minWidth: '280px' }}>
      <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}22 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #00a2ff 100%)` }}>
            <span className="codicon codicon-run-all" style={{ color: '#fff', fontSize: '16px' }}></span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.4px' }}>PIPELINE START</span>
        </div>
      </div>

      <div className="glass-node-body">
        <div className="glass-node-input-group">
          <label className="glass-node-input-label">Pipeline Name</label>
          <input
            className="nodrag"
            type="text"
            value={label}
            onChange={(e) => {
              const v = e.target.value;
              setLabel(v);
              updateNodeData(id, { label: v });
            }}
            placeholder="My Pipeline"
          />
        </div>

        <div className="glass-node-input-group">
          <label className="glass-node-input-label">Description</label>
          <textarea
            className="nodrag"
            value={description}
            onChange={(e) => {
              const v = e.target.value;
              setDescription(v);
              updateNodeData(id, { description: v });
            }}
            placeholder="Optional description…"
            rows={2}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="success" style={handleStyle} />
    </div>
  );
};

export default memo(StartNode);

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

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '3px solid rgba(30, 30, 35, 0.85)',
    boxShadow: '0 0 8px rgba(0,0,0,0.4)',
    zIndex: 10,
    background: '#007acc',
    right: '-6px'
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '0px',
        borderRadius: '12px',
        background: 'rgba(30, 30, 35, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(0, 122, 204, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        minWidth: '280px',
        color: '#e0e0e0',
        fontFamily: 'var(--vscode-font-family)',
        overflow: 'visible'
      }}
    >
      <div style={{ 
        padding: '10px 12px', 
        background: 'rgba(0, 122, 204, 0.2)', 
        borderTopLeftRadius: '12px', 
        borderTopRightRadius: '12px',
        fontWeight: 'bold', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ 
          width: '24px', height: '24px', borderRadius: '50%', 
          background: '#007acc',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <span className="codicon codicon-run-all" style={{ color: '#fff', fontSize: '14px' }}></span>
        </div>
        <span style={{ fontSize: '13px', letterSpacing: '0.4px' }}>PIPELINE START</span>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Pipeline Name</label>
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
            style={{
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Description</label>
          <textarea
            className="nodrag"
            value={description}
            onChange={(e) => {
              const v = e.target.value;
              setDescription(v);
              updateNodeData(id, { description: v });
            }}
            placeholder="Optional…"
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '11px',
              fontFamily: 'var(--vscode-font-family)'
            }}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="success" style={handleStyle} />
    </div>
  );
};

export default memo(StartNode);

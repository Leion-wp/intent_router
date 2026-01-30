import { memo, useContext, useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';

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

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: '6px',
        background: 'var(--vscode-editor-background)',
        border: '2px solid var(--vscode-focusBorder)',
        minWidth: '260px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)',
      }}
    >
      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="codicon codicon-run-all"></span>
        <span>Start</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>Pipeline name</label>
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
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              padding: '4px',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>Description</label>
          <textarea
            className="nodrag"
            value={description}
            onChange={(e) => {
              const v = e.target.value;
              setDescription(v);
              updateNodeData(id, { description: v });
            }}
            placeholder="Optional…"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              padding: '6px',
              fontFamily: 'var(--vscode-font-family)',
              fontSize: '12px',
            }}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(StartNode);

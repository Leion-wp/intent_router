import { memo, useEffect, useRef, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';

const StartNode = ({ data }: NodeProps) => {
  const [label, setLabel] = useState<string>((data.label as string) || 'My Pipeline');
  const [description, setDescription] = useState<string>((data.description as string) || '');
  const externalSyncPendingRef = useRef(false);

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextLabel = (data.label as string) || 'My Pipeline';
    const nextDescription = (data.description as string) || '';
    const labelChanged = nextLabel !== label;
    const descChanged = nextDescription !== description;
    if (labelChanged || descChanged) {
      externalSyncPendingRef.current = true;
      if (labelChanged) setLabel(nextLabel);
      if (descChanged) setDescription(nextDescription);
      return;
    }
    externalSyncPendingRef.current = false;
  }, [data.label, data.description]);

  useEffect(() => {
    if (externalSyncPendingRef.current) {
      return;
    }
    data.label = label;
    data.description = description;
    data.kind = 'start';
  }, [label, description]);

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
            onChange={(e) => setLabel(e.target.value)}
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
            onChange={(e) => setDescription(e.target.value)}
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

import { memo, useState, useEffect, useContext, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowRuntimeContext } from '../App';

const PromptNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const [name, setName] = useState<string>((data.name as string) || '');
  const [defaultValue, setDefaultValue] = useState<string>((data.value as string) || '');
  const externalSyncPendingRef = useRef(false);

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextName = (data.name as string) || '';
    const nextValue = (data.value as string) || '';
    const nameChanged = nextName !== name;
    const valueChanged = nextValue !== defaultValue;
    if (nameChanged || valueChanged) {
      externalSyncPendingRef.current = true;
      if (nameChanged) setName(nextName);
      if (valueChanged) setDefaultValue(nextValue);
      return;
    }
    externalSyncPendingRef.current = false;
  }, [data.name, data.value]);

  useEffect(() => {
    if (externalSyncPendingRef.current) {
      return;
    }
    data.name = name;
    data.value = defaultValue;
    data.kind = 'prompt'; // Mark kind for serialization
  }, [name, defaultValue]);

  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: '2px solid var(--vscode-charts-purple)',
      boxShadow: isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none',
      minWidth: '200px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Left} />

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="codicon codicon-symbol-string"></span>
        <span>Prompt / Set Var</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            Variable Name <span style={{ color: '#f44336' }}>*</span>
          </label>
          <input
            className="nodrag"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. branchName"
            style={{
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              padding: '4px'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            Default Value
          </label>
          <input
            className="nodrag"
            type="text"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Default value"
            style={{
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              padding: '4px'
            }}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(PromptNode);

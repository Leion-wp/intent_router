import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

const VSCodeCommandNode = ({ data }: NodeProps) => {
  const [commandId, setCommandId] = useState<string>((data.commandId as string) || '');
  const [argsJson, setArgsJson] = useState<string>((data.argsJson as string) || '');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    data.kind = 'vscodeCommand';
    data.commandId = commandId;
    data.argsJson = argsJson;

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

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: '2px solid var(--vscode-charts-blue)',
        minWidth: '260px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="codicon codicon-vscode"></span>
        <span>VS Code Command</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            commandId <span style={{ color: '#f44336' }}>*</span>
          </label>
          <input
            className="nodrag"
            type="text"
            value={commandId}
            onChange={(e) => setCommandId(e.target.value)}
            placeholder="e.g. workbench.action.files.save"
            style={{
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              padding: '4px'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label style={{ fontSize: '0.75em', opacity: 0.9 }}>args (JSON)</label>
            {error && <span style={{ fontSize: '0.7em', color: 'var(--vscode-inputValidation-errorForeground)' }}>{error}</span>}
          </div>
          <textarea
            className="nodrag"
            value={argsJson}
            onChange={(e) => setArgsJson(e.target.value)}
            placeholder='[] or {"foo":"bar"}'
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: `1px solid ${error ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border)'}`,
              padding: '6px',
              fontFamily: 'var(--vscode-editor-font-family, Consolas, monospace)',
              fontSize: '12px'
            }}
          />
        </div>

        <div style={{ fontSize: '0.7em', opacity: 0.7 }}>
          This node is interactive/non-deterministic for many commands.
        </div>
      </div>

      <Handle id="out" type="source" position={Position.Right} />
    </div>
  );
};

export default memo(VSCodeCommandNode);

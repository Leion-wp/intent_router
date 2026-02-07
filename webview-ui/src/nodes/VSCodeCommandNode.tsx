import { memo, useEffect, useState, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

const VSCodeCommandNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [commandId, setCommandId] = useState<string>((data.commandId as string) || '');
  const [argsJson, setArgsJson] = useState<string>((data.argsJson as string) || '');
  const [error, setError] = useState<string>('');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const collapsed = !!data.collapsed;

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextCommandId = (data.commandId as string) || '';
    const nextArgsJson = (data.argsJson as string) || '';
    if (nextCommandId !== commandId) setCommandId(nextCommandId);
    if (nextArgsJson !== argsJson) setArgsJson(nextArgsJson);
    if (data.label !== undefined) setLabel((data.label as string) || '');
  }, [data.commandId, data.argsJson]);

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

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: '2px solid var(--vscode-charts-blue)',
        boxShadow: isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none',
        minWidth: '260px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="codicon codicon-vscode"></span>
          <span title="Interactive (requires human / UI)" style={{ fontSize: '12px' }}>
            👤
          </span>
          {editingLabel ? (
            <input
              className="nodrag"
              value={label}
              autoFocus
              onChange={(e) => {
                const v = e.target.value;
                setLabel(v);
                updateNodeData(id, { label: v });
              }}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingLabel(false);
              }}
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
            />
          ) : (
            <span
              title="Click to rename"
              onClick={() => setEditingLabel(true)}
              style={{ cursor: 'text', userSelect: 'none' }}
            >
              {label || 'VS Code Command'}
            </span>
          )}
        </div>
        <button
          className="nodrag"
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'transparent',
            color: 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-editorWidget-border)',
            borderRadius: '4px',
            width: '20px',
            height: '20px',
            cursor: 'pointer'
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            commandId <span style={{ color: 'var(--ir-status-error)' }}>*</span>
          </label>
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
            onChange={(e) => {
              const v = e.target.value;
              setArgsJson(v);
              updateNodeData(id, { argsJson: v });
            }}
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
      )}

      <Handle id="out" type="source" position={Position.Right} />
    </div>
  );
};

export default memo(VSCodeCommandNode);

import { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import IoSpec from '../components/IoSpec';

const PromptNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [name, setName] = useState<string>((data.name as string) || '');
  const [defaultValue, setDefaultValue] = useState<string>((data.value as string) || '');
  const [label, setLabel] = useState<string>((data.label as string) || '');
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
  }, [data.name, data.value]);

  // Ensure kind is set
  useEffect(() => {
    if (data.kind !== 'prompt') {
      data.kind = 'prompt';
    }
  }, []);

  return (
    <div style={{
      position: 'relative',
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: '2px solid var(--vscode-charts-purple)',
      boxShadow: isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none',
      minWidth: '200px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ top: handleTop(index, inputHandles.length) }}
          />
          <span
            style={{
              position: 'absolute',
              left: '-2px',
              top: handleTop(index, inputHandles.length),
              transform: 'translate(-100%, -50%)',
              fontSize: '10px',
              opacity: inputName === 'in' ? 0.8 : 0.65,
              whiteSpace: 'nowrap'
            }}
          >
            {inputName}
          </span>
        </div>
      ))}

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="codicon codicon-symbol-string"></span>
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
              {label || 'Prompt / Set Var'}
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
        <IoSpec
          inputs={['name*', 'default']}
          outputs={[name ? `var:${name}` : 'var']}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            Variable Name <span style={{ color: 'var(--ir-status-error)' }}>*</span>
          </label>
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
            onChange={(e) => {
              const v = e.target.value;
              setDefaultValue(v);
              updateNodeData(id, { value: v });
            }}
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
      )}

      <Handle type="source" position={Position.Right} id="success" />
      <span style={{ position: 'absolute', right: '-2px', top: '50%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' }}>success</span>
      <Handle type="source" position={Position.Right} id="out_value" style={{ top: '74%', background: '#7e57c2' }} />
      <span style={{ position: 'absolute', right: '-2px', top: '74%', transform: 'translate(100%, -50%)', fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap' }}>value</span>
    </div>
  );
};

export default memo(PromptNode);

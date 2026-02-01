import { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

const RepoNode = ({ data, id }: NodeProps) => {
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const { updateNodeData } = useContext(FlowEditorContext);
  const [path, setPath] = useState<string>((data.path as string) || '');
  const [label, setLabel] = useState<string>((data.label as string) || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const collapsed = !!data.collapsed;

  // Sync from external updates (e.g. drawer edits)
  useEffect(() => {
    const nextPath = (data.path as string) || '';
    if (nextPath !== path) setPath(nextPath);
    if (data.label !== undefined) setLabel((data.label as string) || '');
  }, [data.path]);

  // Ensure kind is set
  useEffect(() => {
    if (data.kind !== 'repo') {
      data.kind = 'repo';
    }
  }, []);

  const handleBrowse = () => {
      // Send message to extension
      if (window.vscode) {
          window.vscode.postMessage({
              type: 'selectPath',
              id: id,
              argName: 'path'
          });

          const handleMessage = (event: MessageEvent) => {
              const message = event.data;
              if (message.type === 'pathSelected' && message.id === id && message.argName === 'path') {
                  setPath(message.path);
                  updateNodeData(id, { path: message.path });
                  window.removeEventListener('message', handleMessage);
              }
          };
          window.addEventListener('message', handleMessage);
      } else {
          console.log('Browse clicked (Mock): path');
          setPath('/mock/path/repo');
      }
  };

  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      background: 'var(--vscode-editor-background)',
      border: '2px solid var(--vscode-charts-yellow)',
      boxShadow: isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none',
      minWidth: '200px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Left} />

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span className="codicon codicon-repo"></span>
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
              {label || 'Repository'}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            Path
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              className="nodrag"
              type="text"
              value={path}
              onChange={(e) => {
                const v = e.target.value;
                setPath(v);
                updateNodeData(id, { path: v });
              }}
              placeholder="${workspaceRoot}"
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '4px'
              }}
            />
            <button
                className="nodrag"
                onClick={handleBrowse}
                title="Browse..."
                style={{
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                <span className="codicon codicon-folder-opened"></span>
            </button>
          </div>
      </div>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(RepoNode);

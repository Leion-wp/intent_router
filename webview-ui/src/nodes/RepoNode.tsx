import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

const RepoNode = ({ data, id }: NodeProps) => {
  const [path, setPath] = useState<string>((data.path as string) || '');

  useEffect(() => {
    data.path = path;
    data.kind = 'repo'; // Mark kind for serialization
  }, [path]);

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
      minWidth: '200px',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Left} />

      <div style={{ marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="codicon codicon-repo"></span>
        <span>Repository</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ fontSize: '0.75em', opacity: 0.9 }}>
            Path
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              className="nodrag"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
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

      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(RepoNode);

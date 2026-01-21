import React from 'react';

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string, provider: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/provider', provider);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside style={{
      width: '200px',
      borderRight: '1px solid #333',
      padding: '10px',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginBottom: '10px' }}>Providers</div>

      <div className="dndnode input" onDragStart={(event) => onDragStart(event, 'actionNode', 'terminal')} draggable style={nodeStyle}>
        Terminal
      </div>
      <div className="dndnode" onDragStart={(event) => onDragStart(event, 'actionNode', 'system')} draggable style={nodeStyle}>
        System
      </div>
      <div className="dndnode output" onDragStart={(event) => onDragStart(event, 'actionNode', 'git')} draggable style={nodeStyle}>
        Git
      </div>
      <div className="dndnode output" onDragStart={(event) => onDragStart(event, 'actionNode', 'docker')} draggable style={nodeStyle}>
        Docker
      </div>

      <div style={{ marginTop: 'auto', fontSize: '0.8em', color: '#888' }}>
        Drag to graph
      </div>
    </aside>
  );
}

const nodeStyle = {
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #555',
  borderRadius: '4px',
  cursor: 'grab',
  background: 'var(--vscode-sideBar-background)',
};

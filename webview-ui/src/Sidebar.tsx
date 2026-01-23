import React from 'react';

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string, provider: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/provider', provider);
    event.dataTransfer.effectAllowed = 'move';
  };

  const providers = [
    { id: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
    { id: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
    { id: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
    { id: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Providers
      </div>

      <div className="sidebar-list">
        {providers.map((p) => (
          <div
            key={p.id}
            className="dndnode"
            onDragStart={(event) => onDragStart(event, 'actionNode', p.id)}
            draggable
            title={`Drag to add ${p.label} - ${p.desc}`}
            aria-label={`Add ${p.label} node`}
            tabIndex={0}
            role="listitem"
          >
            <span className={`codicon ${p.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
            <span>{p.label}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="codicon codicon-info"></span>
        <span>Drag items to the graph</span>
      </div>
    </aside>
  );
}

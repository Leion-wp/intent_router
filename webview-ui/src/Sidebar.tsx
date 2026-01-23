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
    <aside style={{
        width: '280px',
        minWidth: '240px',
        maxWidth: '360px',
        flexShrink: 0,
        borderRight: '1px solid var(--vscode-panel-border)',
        padding: '16px',
        background: 'var(--vscode-sideBar-background)',
        color: 'var(--vscode-sideBar-foreground)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)'
      }}>

      <div style={{
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        opacity: 0.8,
        letterSpacing: '0.5px'
      }}>
        Providers
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {providers.map((p) => (
          <div
            key={p.id}
            className="dndnode"
            onDragStart={(event) => onDragStart(event, 'actionNode', p.id)}
            draggable
            title={p.desc}
            role="listitem"
            tabIndex={0}
            aria-label={`Drag ${p.label} to graph`}
          >
            <span className={`codicon ${p.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
            <span>{p.label}</span>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 'auto',
        fontSize: '11px',
        opacity: 0.6,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span className="codicon codicon-info"></span>
        <span>Drag items to the graph</span>
      </div>
    </aside>
  );
}


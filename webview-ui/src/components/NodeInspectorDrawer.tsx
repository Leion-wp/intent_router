import React from 'react';

type NodeInspectorDrawerProps = {
  drawerNode: any;
  setDrawerNodeId: (id: string | null) => void;
};

function NodeInspectorDrawer(props: NodeInspectorDrawerProps) {
  const { drawerNode, setDrawerNodeId } = props;
  if (!drawerNode) return null;

  const inspector = {
    id: drawerNode.id,
    type: drawerNode.type,
    position: (drawerNode as any).position,
    data: drawerNode.data
  };
  const inspectorJson = JSON.stringify(inspector, null, 2);
  const logs = Array.isArray((drawerNode.data as any)?.logs)
    ? (drawerNode.data as any).logs.map((line: any) => String(line?.text ?? line)).join('\n')
    : '';

  return (
    <div
      className="nodrag"
      role="dialog"
      aria-label="Node inspector"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '360px',
        background: 'var(--vscode-sideBar-background)',
        borderLeft: '1px solid var(--vscode-sideBar-border)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        style={{
          padding: '10px',
          borderBottom: '1px solid var(--vscode-sideBar-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {drawerNode.id === 'start'
            ? 'Start'
            : drawerNode.type === 'actionNode'
              ? `${drawerNode.data?.provider || 'action'} · ${drawerNode.data?.capability || ''}`
              : drawerNode.type}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="nodrag"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inspectorJson);
              } catch (error) {
                console.warn('Failed to copy to clipboard', error);
              }
            }}
            title="Copy node JSON"
            style={{
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="nodrag"
            onClick={() => setDrawerNodeId(null)}
            title="Close"
            style={{
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              border: '1px solid var(--vscode-sideBar-border)',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ padding: '10px', overflow: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>
            <div><b>ID:</b> {drawerNode.id}</div>
            <div><b>Type:</b> {String(drawerNode.type)}</div>
            {drawerNode.data?.status && <div><b>Status:</b> {String(drawerNode.data.status)}</div>}
            {(drawerNode.data as any)?.intentId && <div><b>Intent:</b> {String((drawerNode.data as any).intentId)}</div>}
          </div>

          {logs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Logs</div>
              <pre
                style={{
                  margin: 0,
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--vscode-input-border)',
                  background: 'var(--vscode-editor-background)',
                  color: 'var(--vscode-editor-foreground)',
                  fontSize: '11px',
                  maxHeight: '160px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {logs}
              </pre>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', opacity: 0.85 }}>Node JSON</div>
            <pre
              style={{
                margin: 0,
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid var(--vscode-input-border)',
                background: 'var(--vscode-editor-background)',
                color: 'var(--vscode-editor-foreground)',
                fontSize: '11px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {inspectorJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(NodeInspectorDrawer);

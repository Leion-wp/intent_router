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
        width: '380px',
        background: 'var(--ir-glass-bg)',
        backdropFilter: 'var(--ir-glass-blur)',
        borderLeft: '1px solid var(--ir-glass-border)',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--ir-node-text)'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--ir-glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {drawerNode.id === 'start'
            ? 'Start'
            : drawerNode.type === 'actionNode'
              ? `${drawerNode.data?.provider || 'action'} · ${drawerNode.data?.capability || ''}`
              : drawerNode.type}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="nodrag cp-btn-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inspectorJson);
              } catch (error) {
                console.warn('Failed to copy to clipboard', error);
              }
            }}
            title="Copy node JSON"
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="nodrag cp-btn-secondary"
            onClick={() => setDrawerNodeId(null)}
            title="Close"
            style={{
              background: 'rgba(255,255,255,0.1)',
              borderColor: 'rgba(255,255,255,0.2)'
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ padding: '20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: '13px', opacity: 0.9, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div><b style={{ color: 'var(--ir-accent-primary)' }}>ID:</b> {drawerNode.id}</div>
          <div><b style={{ color: 'var(--ir-accent-primary)' }}>Type:</b> {String(drawerNode.type)}</div>
          {drawerNode.data?.status && <div><b style={{ color: 'var(--ir-accent-primary)' }}>Status:</b> {String(drawerNode.data.status)}</div>}
          {(drawerNode.data as any)?.intentId && <div><b style={{ color: 'var(--ir-accent-primary)' }}>Intent:</b> {String((drawerNode.data as any).intentId)}</div>}
        </div>

        {logs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Logs</div>
            <pre
              style={{
                margin: 0,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--ir-glass-border)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                fontSize: '12px',
                maxHeight: '200px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace'
              }}
            >
              {logs}
            </pre>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Node JSON</div>
          <pre
            style={{
              margin: 0,
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--ir-glass-border)',
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
              fontSize: '12px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace'
            }}
          >
            {inspectorJson}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default React.memo(NodeInspectorDrawer);

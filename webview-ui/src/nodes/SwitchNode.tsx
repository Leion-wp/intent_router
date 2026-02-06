import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

type SwitchRoute = {
  label: string;
  equalsValue: string;
};

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: '#007acc',
  success: '#4caf50',
  failure: '#f44336'
};

const SwitchNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars } = useContext(FlowRuntimeContext);

  const [variableKey, setVariableKey] = useState<string>(String((data as any)?.variableKey || ''));
  const [routes, setRoutes] = useState<SwitchRoute[]>(Array.isArray((data as any)?.routes) ? ((data as any).routes as any[]) : []);
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.variableKey !== undefined) setVariableKey(String((data as any).variableKey || ''));
    if (Array.isArray((data as any)?.routes)) setRoutes((data as any).routes as any[]);
    if ((data as any)?.status) setStatus(String((data as any).status));
  }, [data]);

  const availableVars = useMemo(() => {
    try {
      return getAvailableVars();
    } catch {
      return [];
    }
  }, [getAvailableVars]);

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;

  const setRoute = (index: number, patch: Partial<SwitchRoute>) => {
    const next = [...routes];
    next[index] = { ...next[index], ...patch };
    setRoutes(next);
    updateNodeData(id, { routes: next });
  };

  const addRoute = () => {
    const next = [...routes, { label: `route ${routes.length + 1}`, equalsValue: '' }];
    setRoutes(next);
    updateNodeData(id, { routes: next });
  };

  const removeRoute = (index: number) => {
    const next = routes.filter((_, i) => i !== index);
    setRoutes(next);
    updateNodeData(id, { routes: next });
  };

  const handleTop = (i: number, total: number) => {
    if (total <= 1) return '40%';
    const min = 28;
    const max = 78;
    const t = min + ((max - min) * i) / (total - 1);
    return `${t}%`;
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: `2px solid ${borderColor}`,
        minWidth: '280px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      <Handle type="target" position={Position.Left} />

      {/* Dynamic route outputs */}
      {routes.map((r, i) => (
        <div key={i}>
          <Handle
            type="source"
            position={Position.Right}
            id={`route_${i}`}
            title={r.label || `route_${i}`}
            style={{ top: handleTop(i, Math.max(routes.length, 1)), background: 'var(--vscode-button-background)' }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-2px',
              top: handleTop(i, Math.max(routes.length, 1)),
              transform: 'translate(100%, -50%)',
              fontSize: '10px',
              opacity: 0.85,
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {r.label || `route_${i}`}
          </div>
        </div>
      ))}

      {/* Default output */}
      <div>
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          title="default"
          style={{ top: '90%', background: 'var(--vscode-button-secondaryBackground)' }}
        />
        <div
          style={{
            position: 'absolute',
            right: '-2px',
            top: '90%',
            transform: 'translate(100%, -50%)',
            fontSize: '10px',
            opacity: 0.85,
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          default
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}>
        <span className="codicon codicon-filter"></span>
        <span>Switch</span>
      </div>

      {!collapsed && (
        <>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Variable key</div>
            <input
              className="nodrag"
              list={`switch-vars-${id}`}
              value={variableKey}
              onChange={(e) => {
                const v = e.target.value;
                setVariableKey(v);
                updateNodeData(id, { variableKey: v });
              }}
              placeholder="mode"
              style={{
                width: '100%',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '6px',
                fontSize: '11px'
              }}
            />
            <datalist id={`switch-vars-${id}`}>
              {availableVars.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '4px' }}>
              Uses the variable store (from Form/Prompt/env) for exact match routing.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', opacity: 0.85 }}>Routes</div>
            <button
              className="nodrag"
              onClick={addRoute}
              style={{
                background: 'none',
                border: '1px solid var(--vscode-panel-border)',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              + Route
            </button>
          </div>

          {routes.length === 0 && <div style={{ fontSize: '11px', opacity: 0.7 }}>No routes. Only default output will be used.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {routes.map((r, i) => (
              <div key={i} style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', padding: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: '6px', alignItems: 'center' }}>
                  <input
                    className="nodrag"
                    value={String(r.label || '')}
                    onChange={(e) => setRoute(i, { label: e.target.value })}
                    placeholder="label (e.g. docker)"
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    className="nodrag"
                    value={String(r.equalsValue || '')}
                    onChange={(e) => setRoute(i, { equalsValue: e.target.value })}
                    placeholder="equals value (e.g. docker)"
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <button
                    className="nodrag"
                    onClick={() => removeRoute(i)}
                    title="Remove"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '4px' }}>
                  Connect the <span style={{ fontFamily: 'monospace' }}>{`route_${i}`}</span> output handle to the first step of this branch.
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default memo(SwitchNode);

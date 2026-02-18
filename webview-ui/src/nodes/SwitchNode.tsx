import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import IoSpec from '../components/IoSpec';

type SwitchCondition = 'equals' | 'exists' | 'contains' | 'regex';

type SwitchRoute = {
  label: string;
  condition: SwitchCondition;
  value: string;
};

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
};

const normalizeCondition = (value: unknown): SwitchCondition => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'exists' || candidate === 'contains' || candidate === 'regex') {
    return candidate;
  }
  return 'equals';
};

const normalizeRoutes = (raw: any): SwitchRoute[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry: any, index: number) => {
    const condition = normalizeCondition(entry?.condition);
    const fallbackValue = String(entry?.value ?? entry?.equalsValue ?? '').trim();
    return {
      label: String(entry?.label || `route_${index}`),
      condition,
      value: fallbackValue
    };
  });
};

const isValidRegex = (pattern: string): boolean => {
  if (!pattern) {
    return false;
  }
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const SwitchNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars } = useContext(FlowRuntimeContext);

  const [variableKey, setVariableKey] = useState<string>(String((data as any)?.variableKey || ''));
  const [routes, setRoutes] = useState<SwitchRoute[]>(normalizeRoutes((data as any)?.routes));
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const [label, setLabel] = useState<string>(String((data as any)?.label || 'Switch'));
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.variableKey !== undefined) setVariableKey(String((data as any).variableKey || ''));
    if (Array.isArray((data as any)?.routes)) setRoutes(normalizeRoutes((data as any).routes));
    if ((data as any)?.status) setStatus(String((data as any).status));
    if ((data as any)?.label !== undefined) setLabel(String((data as any).label || 'Switch'));
  }, [data]);

  const availableVars = useMemo(() => {
    try {
      return getAvailableVars();
    } catch {
      return [];
    }
  }, [getAvailableVars]);

  const isRunning = status === 'running';
  const themeColor = '#4ec9b0';

  const handleTop = (i: number, total: number) => {
    if (total <= 1) return '40%';
    const min = 28;
    const max = 78;
    const t = min + ((max - min) * i) / (total - 1);
    return `${t}%`;
  };

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  const commitRoutes = (next: SwitchRoute[]) => {
    setRoutes(next);
    updateNodeData(id, { routes: next });
  };

  const setRoute = (index: number, patch: Partial<SwitchRoute>) => {
    const next = routes.map((route, routeIndex) => {
      if (routeIndex !== index) return route;
      const condition = normalizeCondition((patch as any).condition ?? route.condition);
      const value = condition === 'exists'
        ? ''
        : String((patch as any).value ?? route.value ?? '');
      return {
        ...route,
        ...patch,
        condition,
        value
      };
    });
    commitRoutes(next);
  };

  const addRoute = () => {
    const nextIndex = routes.length;
    const next: SwitchRoute[] = [
      ...routes,
      {
        label: `route_${nextIndex}`,
        condition: 'equals',
        value: ''
      }
    ];
    commitRoutes(next);
  };

  const removeRoute = (index: number) => {
    const next = routes
      .filter((_, routeIndex) => routeIndex !== index)
      .map((route, routeIndex) => ({
        ...route,
        label: route.label || `route_${routeIndex}`
      }));
    commitRoutes(next);
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '300px' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-6px', background: themeColor }} />

      {/* Dynamic route outputs */}
      {routes.map((r, i) => (
        <div key={i}>
          <Handle
            type="source"
            position={Position.Right}
            id={`route_${i}`}
            title={r.label || `route_${i}`}
            style={{ ...handleStyle, top: handleTop(i, Math.max(routes.length, 1)), right: '-6px', background: 'var(--ir-accent-primary)' }}
          />
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: handleTop(i, Math.max(routes.length, 1)),
              transform: 'translate(0, -50%)',
              fontSize: '10px',
              fontWeight: 700,
              opacity: 0.4,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
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
          style={{ ...handleStyle, top: '92%', right: '-6px', background: 'rgba(255,255,255,0.3)' }}
        />
        <div
          style={{
            position: 'absolute',
            right: '12px',
            top: '92%',
            transform: 'translate(0, -50%)',
            fontSize: '10px',
            fontWeight: 700,
            opacity: 0.4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          default
        </div>
      </div>

      <div>
        <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}15 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #45b39d 100%)` }}>
              <span className="codicon codicon-filter" style={{ color: '#fff', fontSize: '16px' }}></span>
            </div>
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => {
                  const next = e.target.value;
                  setLabel(next);
                  updateNodeData(id, { label: next });
                }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
                style={{ width: '100%' }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} className="glass-node-label">
                {label || 'Switch'}
              </span>
            )}
          </div>
          <button
            className="nodrag"
            onClick={() => updateNodeData(id, { collapsed: !collapsed })}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: 'none', 
              color: '#aaa', 
              cursor: 'pointer',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: '12px' }}></span>
          </button>
        </div>

        {!collapsed && (
          <div className="glass-node-body">
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Variable key</label>
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
              />
              <datalist id={`switch-vars-${id}`}>
                {availableVars.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <label className="glass-node-input-label">Routes</label>
              <button
                className="nodrag"
                onClick={addRoute}
                style={{
                  background: 'var(--ir-accent-primary)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 10px rgba(0, 162, 255, 0.2)'
                }}
              >
                + Add Route
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {routes.map((r, i) => (
                <div key={i} style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: '10px', 
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      className="nodrag"
                      value={String(r.label || '')}
                      onChange={(e) => setRoute(i, { label: e.target.value })}
                      placeholder="Label"
                      style={{ fontSize: '11px', padding: '6px 10px' }}
                    />
                    <select
                      className="nodrag"
                      value={String(r.condition || 'equals')}
                      onChange={(e) => setRoute(i, { condition: normalizeCondition(e.target.value) })}
                      style={{ fontSize: '11px', padding: '6px' }}
                    >
                      <option value="equals" style={{ background: '#1a1a20' }}>equals</option>
                      <option value="exists" style={{ background: '#1a1a20' }}>exists</option>
                      <option value="contains" style={{ background: '#1a1a20' }}>contains</option>
                      <option value="regex" style={{ background: '#1a1a20' }}>regex</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      className="nodrag"
                      value={String(r.value || '')}
                      onChange={(e) => setRoute(i, { value: e.target.value })}
                      placeholder="Value"
                      disabled={r.condition === 'exists'}
                      style={{ 
                        flex: 1, 
                        fontSize: '11px', 
                        padding: '6px 10px',
                        opacity: r.condition === 'exists' ? 0.3 : 1,
                        border: r.condition === 'regex' && String(r.value || '').trim() && !isValidRegex(String(r.value || '').trim())
                          ? '1px solid #ff4d4d'
                          : undefined
                      }}
                    />
                    <button
                      className="nodrag"
                      onClick={() => removeRoute(i)}
                      style={{ 
                        background: 'rgba(255, 77, 77, 0.1)', 
                        border: 'none', 
                        cursor: 'pointer', 
                        color: '#ff4d4d', 
                        borderRadius: '6px',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <span className="codicon codicon-trash" style={{ fontSize: '14px' }}></span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(SwitchNode);

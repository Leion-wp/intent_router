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

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;

  const setRoute = (index: number, patch: Partial<SwitchRoute>) => {
    const next = [...routes];
    next[index] = { ...next[index], ...patch };
    setRoutes(next);
    updateNodeData(id, { routes: next });
  };

  const addRoute = () => {
    const next = [...routes, { label: `route ${routes.length + 1}`, condition: 'equals', value: '' }];
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

  const handleStyle = {
    width: '10px',
    height: '10px',
    border: '2px solid rgba(30, 30, 35, 0.85)',
    boxShadow: '0 0 5px rgba(0,0,0,0.4)',
    zIndex: 10
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '0px',
        borderRadius: '12px',
        background: 'rgba(30, 30, 35, 0.85)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${status === 'running' ? '#4ec9b0' : 'rgba(78, 201, 176, 0.4)'}`,
        boxShadow: status === 'running' ? `0 0 20px rgba(78, 201, 176, 0.4)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
        minWidth: '300px',
        color: '#e0e0e0',
        fontFamily: 'var(--vscode-font-family)',
        transition: 'all 0.3s ease'
      }}
    >
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-5px', background: '#4ec9b0' }} />

      {/* Dynamic route outputs */}
      {routes.map((r, i) => (
        <div key={i}>
          <Handle
            type="source"
            position={Position.Right}
            id={`route_${i}`}
            title={r.label || `route_${i}`}
            style={{ ...handleStyle, top: handleTop(i, Math.max(routes.length, 1)), right: '-5px', background: 'var(--vscode-button-background)' }}
          />
          <div
            style={{
              position: 'absolute',
              right: '10px',
              top: handleTop(i, Math.max(routes.length, 1)),
              transform: 'translate(0, -50%)',
              fontSize: '9px',
              fontWeight: 'bold',
              opacity: 0.5,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase'
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
          style={{ ...handleStyle, top: '90%', right: '-5px', background: '#666' }}
        />
        <div
          style={{
            position: 'absolute',
            right: '10px',
            top: '90%',
            transform: 'translate(0, -50%)',
            fontSize: '9px',
            fontWeight: 'bold',
            opacity: 0.5,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase'
          }}
        >
          default
        </div>
      </div>

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(78, 201, 176, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#4ec9b0',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-filter" style={{ color: '#fff', fontSize: '14px' }}></span>
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
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '13px'
                }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} style={{ fontSize: '13px', letterSpacing: '0.4px', cursor: 'pointer' }}>
                {label || 'Switch'}
              </span>
            )}
          </div>
          <button
            className="nodrag"
            onClick={() => updateNodeData(id, { collapsed: !collapsed })}
            style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`}></span>
          </button>
        </div>

        {!collapsed && (
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Variable key</label>
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
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              />
              <datalist id={`switch-vars-${id}`}>
                {availableVars.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Routes</label>
              <button
                className="nodrag"
                onClick={addRoute}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}
              >
                + Route
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {routes.map((r, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                    <input
                      className="nodrag"
                      value={String(r.label || '')}
                      onChange={(e) => setRoute(i, { label: e.target.value })}
                      placeholder="Label"
                      style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px' }}
                    />
                    <select
                      className="nodrag"
                      value={String(r.condition || 'equals')}
                      onChange={(e) => setRoute(i, { condition: normalizeCondition(e.target.value) })}
                      style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px' }}
                    >
                      <option value="equals">equals</option>
                      <option value="exists">exists</option>
                      <option value="contains">contains</option>
                      <option value="regex">regex</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      className="nodrag"
                      value={String(r.value || '')}
                      onChange={(e) => setRoute(i, { value: e.target.value })}
                      placeholder="Value"
                      disabled={r.condition === 'exists'}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px', fontSize: '11px', borderRadius: '4px', opacity: r.condition === 'exists' ? 0.4 : 1 }}
                    />
                    <button
                      className="nodrag"
                      onClick={() => removeRoute(i)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f44336', fontSize: '14px' }}
                    >
                      ×
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

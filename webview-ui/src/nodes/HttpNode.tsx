import { memo, useState, useEffect, useContext, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

const STATUS_COLORS = {
  idle: '#00d2ff',
  running: '#f2c94c',
  success: '#4caf50',
  failure: '#f44336',
  error: '#f44336'
};

const HttpNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars } = useContext(FlowRuntimeContext);

  const [url, setUrl] = useState<string>((data.url as string) || 'https://api.github.com/repos/');
  const [method, setMethod] = useState<string>((data.method as string) || 'GET');
  const [headers, setHeaders] = useState<string>((data.headers as string) || `{
  "Content-Type": "application/json"
}`);
  const [body, setBody] = useState<string>((data.body as string) || '');
  const [outputVar, setOutputVar] = useState<string>((data.outputVar as string) || '');
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || 'HTTP Request');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!data.collapsed;

  useEffect(() => {
    if (data.url) setUrl(data.url as string);
    if (data.method) setMethod(data.method as string);
    if (data.headers) setHeaders(data.headers as string);
    if (data.body) setBody(data.body as string);
    if (data.outputVar) setOutputVar(data.outputVar as string);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || 'HTTP Request');

    if (data.logs && (data.logs as any[]).length > 0 && !isConsoleOpen) {
        setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = (data.logs as any[]) || [];

  useEffect(() => {
    if (isConsoleOpen && logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isConsoleOpen]);

  const updateField = (patch: Record<string, any>) => {
    updateNodeData(id, patch);
  };

  const availableVars = useMemo(() => {
    try { return getAvailableVars(); } catch { return []; }
  }, [getAvailableVars]);

  const isRunning = status === 'running';
  const themeColor = '#00d2ff'; // Electric Blue

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '3px solid #1e1e23',
    boxShadow: `0 0 8px ${themeColor}66`,
    zIndex: 100,
    background: themeColor
  };

  return (
    <div style={{
      position: 'relative',
      padding: '0px',
      borderRadius: '14px',
      background: 'rgba(20, 25, 35, 0.9)',
      backdropFilter: 'blur(16px)',
      border: `2px solid ${isRunning ? '#00d2ff' : 'rgba(0, 210, 255, 0.4)'}`,
      boxShadow: isRunning 
        ? `0 0 30px rgba(0, 210, 255, 0.4), inset 0 0 15px rgba(0, 210, 255, 0.1)` 
        : `0 10px 40px rgba(0, 0, 0, 0.6)`,
      minWidth: '320px',
      color: '#efefef',
      fontFamily: 'var(--vscode-font-family)',
      transition: 'all 0.4s ease'
    }}>
      {/* Handles */}
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-10px' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, background: '#4caf50', top: '30%', right: '-10px' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, background: '#f44336', top: '70%', right: '-10px' }} />

      <div style={{ borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ 
          padding: '12px 14px', 
          background: 'rgba(0, 210, 255, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{ 
              width: '26px', height: '24px', borderRadius: '6px', 
              background: themeColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isRunning ? `0 0 15px ${themeColor}` : 'none'
            }}>
              <span className={`codicon codicon-globe`} style={{ fontSize: '14px', color: '#fff' }}></span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>{label}</span>
          </div>
          <button
            className="nodrag"
            onClick={() => updateField({ collapsed: !collapsed })}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7 }}
          >
            <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`}></span>
          </button>
        </div>

        {!collapsed && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Method & URL */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <select
                    className="nodrag"
                    value={method}
                    onChange={(e) => { setMethod(e.target.value); updateField({ method: e.target.value }); }}
                    style={{ background: 'rgba(0,0,0,0.3)', color: themeColor, border: `1px solid rgba(0, 210, 255, 0.3)`, borderRadius: '6px', padding: '4px 8px', fontWeight: 'bold' }}
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                </select>
                <input
                    className="nodrag"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); updateField({ url: e.target.value }); }}
                    placeholder="https://api.github.com/..."
                    style={{ flex: 1, background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                />
            </div>

            {/* Headers & Body Toggle */}
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <div 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                    <span style={{ fontSize: '11px', color: '#999' }}>PAYLOAD & HEADERS</span>
                    <span className={`codicon codicon-chevron-${isSettingsOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', opacity: 0.4 }}></span>
                </div>
                {isSettingsOpen && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
                        <div>
                            <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>HEADERS (JSON)</label>
                            <textarea
                                className="nodrag"
                                value={headers}
                                onChange={(e) => { setHeaders(e.target.value); updateField({ headers: e.target.value }); }}
                                rows={3}
                                style={{ width: '100%', background: '#0a0a0c', color: '#ccc', border: '1px solid #333', padding: '8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>BODY</label>
                            <textarea
                                className="nodrag"
                                value={body}
                                onChange={(e) => { setBody(e.target.value); updateField({ body: e.target.value }); }}
                                rows={4}
                                style={{ width: '100%', background: '#0a0a0c', color: '#ccc', border: '1px solid #333', padding: '8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace' }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Persistence Variable */}
            <div>
                <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>SAVE RESPONSE TO</label>
                <input
                    className="nodrag"
                    value={outputVar}
                    onChange={(e) => { setOutputVar(e.target.value); updateField({ outputVar: e.target.value }); }}
                    placeholder="response_data"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: themeColor, border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '6px', fontSize: '11px' }}
                />
            </div>

            {/* Terminal Output */}
            {logs.length > 0 && (
              <div className="nodrag">
                  <div
                      onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                      style={{
                          fontSize: '10px', padding: '10px 14px', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: 'rgba(0,0,0,0.5)', color: '#aaa', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none'
                      }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`codicon codicon-terminal`} style={{ fontSize: '12px', color: themeColor }}></span>
                          HTTP RESPONSE
                      </span>
                      <span className={`codicon codicon-chevron-${isConsoleOpen ? 'down' : 'up'}`} style={{ fontSize: '10px', opacity: 0.5 }}></span>
                  </div>
                  {isConsoleOpen && (
                      <div
                          ref={logsRef}
                          style={{
                              maxHeight: '180px', overflowY: 'auto', background: '#020204',
                              color: '#fff', padding: '14px', fontSize: '11px',
                              fontFamily: 'monospace', whiteSpace: 'pre-wrap', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
                              border: '1px solid rgba(255,255,255,0.05)', borderTop: 'none'
                          }}>
                          {logs.map((log: any, i: number) => (
                              <div key={i} style={{ color: log.stream === 'stderr' ? '#ff5555' : '#fff', marginBottom: '4px' }}>
                                  {log.text}
                              </div>
                          ))}
                      </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(HttpNode);

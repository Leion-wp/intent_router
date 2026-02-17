import { memo, useState, useEffect, useContext, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

const STATUS_COLORS = {
  idle: '#8a2be2',
  running: '#bb86fc',
  success: '#4caf50',
  failure: '#f44336',
  error: '#f44336'
};

const MODEL_OPTIONS = [
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' }
];

const AgentNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars, isRunPreviewNode } = useContext(FlowRuntimeContext);

  const [agent, setAgent] = useState<string>((data.agent as string) || 'gemini');
  const [model, setModel] = useState<string>((data.model as string) || 'gemini-2.5-flash');
  const [instruction, setInstruction] = useState<string>((data.instruction as string) || '');
  const [contextFiles, setContextFiles] = useState<string[]>((data.contextFiles as string[]) || ['src/**/*.ts']);
  const [outputVar, setOutputVar] = useState<string>((data.outputVar as string) || 'ai_result');
  const [outputVarPath, setOutputVarPath] = useState<string>((data.outputVarPath as string) || 'ai_path');
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || 'AI Agent');
  const [editingLabel, setEditingLabel] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!data.collapsed;

  useEffect(() => {
    if (data.agent) setAgent(data.agent as string);
    if (data.model) setModel(data.model as string);
    if (data.instruction) setInstruction(data.instruction as string);
    if (data.contextFiles) setContextFiles(data.contextFiles as string[]);
    if (data.outputVar) setOutputVar(data.outputVar as string);
    if (data.outputVarPath) setOutputVarPath(data.outputVarPath as string);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || 'AI Agent');

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

  const insertVariable = (varName: string) => {
      const newInst = instruction + `\${var:${varName}}`;
      setInstruction(newInst);
      updateField({ instruction: newInst });
  };

  const isRunning = status === 'running';
  const glowColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;

  // BIGGER AND MORE VISIBLE HANDLES
  const handleStyle = {
    width: '14px',
    height: '14px',
    border: '3px solid #1e1e23',
    boxShadow: '0 0 10px rgba(0,0,0,0.8)',
    zIndex: 100,
    transition: 'transform 0.2s ease'
  };

  return (
    <div style={{
      position: 'relative',
      padding: '0px',
      borderRadius: '14px',
      background: 'rgba(25, 25, 30, 0.9)',
      backdropFilter: 'blur(16px)',
      border: `2px solid ${isRunning ? '#bb86fc' : 'rgba(138, 43, 226, 0.5)'}`,
      boxShadow: isRunning 
        ? `0 0 30px rgba(187, 134, 252, 0.5), inset 0 0 15px rgba(187, 134, 252, 0.1)` 
        : `0 10px 40px rgba(0, 0, 0, 0.6)`,
      minWidth: '340px',
      color: '#efefef',
      fontFamily: 'var(--vscode-font-family)',
      transition: 'all 0.4s ease'
    }}>
      {/* Handles - Shifted outwards and bigger */}
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, background: '#8a2be2', left: '-10px' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, background: '#4caf50', top: '30%', right: '-10px' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, background: '#f44336', top: '70%', right: '-10px' }} />

      <div style={{ borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header / Title Bar */}
        <div style={{ 
          padding: '12px 14px', 
          background: 'rgba(138, 43, 226, 0.25)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{ 
              width: '26px', height: '24px', borderRadius: '6px', 
              background: isRunning ? '#bb86fc' : '#8a2be2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isRunning ? '0 0 15px #bb86fc' : 'none',
              animation: isRunning ? 'pulse 2s infinite' : 'none'
            }}>
              <span className={`codicon codicon-${isRunning ? 'loading spin' : 'sparkle'}`} style={{ fontSize: '14px', color: '#fff' }}></span>
            </div>
            
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => { setLabel(e.target.value); updateField({ label: e.target.value }); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
            ) : (
              <span 
                onClick={() => setEditingLabel(true)} 
                style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px', cursor: 'pointer', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
              >
                {label}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {status !== 'idle' && (
              <div style={{ 
                  fontSize: '9px', padding: '2px 8px', borderRadius: '12px', 
                  background: glowColor, color: '#000', fontWeight: '900', textTransform: 'uppercase' 
              }}>
                  {status}
              </div>
            )}
            <button
              className="nodrag"
              onClick={() => updateField({ collapsed: !collapsed })}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', opacity: 0.7 }}
            >
              <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: '14px' }}></span>
            </button>
          </div>
        </div>

        {!collapsed && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Main Instruction Area */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '1px' }}>System Prompt / Instruction</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {availableVars.length > 0 && (
                      <select
                          className="nodrag"
                          onChange={(e) => insertVariable(e.target.value)}
                          value=""
                          style={{
                              fontSize: '10px', background: 'rgba(138, 43, 226, 0.1)', color: '#bb86fc',
                              border: '1px solid rgba(138, 43, 226, 0.2)', borderRadius: '4px', padding: '1px 8px'
                          }}
                      >
                          <option value="">{'{ }'} Variable</option>
                          {availableVars.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                  )}
                </div>
              </div>
              <textarea
                className="nodrag"
                value={instruction}
                onChange={(e) => { setInstruction(e.target.value); updateField({ instruction: e.target.value }); }}
                placeholder="What should the agent do?"
                rows={4}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  outline: 'none',
                  boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.3)',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Advanced Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <div 
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                      <span style={{ fontSize: '11px', color: '#999', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="codicon codicon-settings-gear" style={{ fontSize: '12px' }}></span>
                          AGENT CONFIGURATION
                      </span>
                      <span className={`codicon codicon-chevron-${isSettingsOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', opacity: 0.4 }}></span>
                  </div>
                  {isSettingsOpen && (
                      <div style={{ padding: '14px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <div>
                              <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Intelligence Model</label>
                              <select
                                  className="nodrag"
                                  value={model}
                                  onChange={(e) => { setModel(e.target.value); updateField({ model: e.target.value }); }}
                                  style={{ width: '100%', background: '#121214', color: '#fff', border: '1px solid #333', padding: '8px', borderRadius: '8px', fontSize: '11px' }}
                              >
                                  {MODEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                  <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Content Var</label>
                                  <input
                                      className="nodrag"
                                      value={outputVar}
                                      onChange={(e) => { setOutputVar(e.target.value); updateField({ outputVar: e.target.value }); }}
                                      placeholder="ai_msg"
                                      style={{ width: '100%', background: '#121214', color: '#fff', border: '1px solid #333', padding: '8px', borderRadius: '8px', fontSize: '11px' }}
                                  />
                              </div>
                              <div>
                                  <label style={{ fontSize: '10px', color: '#555', display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Path Var</label>
                                  <input
                                      className="nodrag"
                                      value={outputVarPath}
                                      onChange={(e) => { setOutputVarPath(e.target.value); updateField({ outputVarPath: e.target.value }); }}
                                      placeholder="ai_path"
                                      style={{ width: '100%', background: '#121214', color: '#fff', border: '1px solid #333', padding: '8px', borderRadius: '8px', fontSize: '11px' }}
                                  />
                              </div>
                          </div>
                      </div>
                  )}
              </div>

              <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#999', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="codicon codicon-library" style={{ fontSize: '12px' }}></span>
                          KNOWLEDGE CONTEXT
                      </span>
                      <button 
                          onClick={() => { const nc = [...contextFiles, '']; setContextFiles(nc); updateField({ contextFiles: nc }); }}
                          style={{ background: 'transparent', border: 'none', color: '#bb86fc', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                      >+</button>
                  </div>
                  <div style={{ padding: '0 10px 10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {contextFiles.map((glob, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                  className="nodrag"
                                  value={glob}
                                  onChange={(e) => { 
                                      const nc = [...contextFiles]; nc[idx] = e.target.value; 
                                      setContextFiles(nc); updateField({ contextFiles: nc }); 
                                  }}
                                  placeholder="src/**/*.ts"
                                  style={{ flex: 1, background: 'rgba(0,0,0,0.3)', color: '#999', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '5px 10px', fontSize: '10px' }}
                              />
                              <button
                                  onClick={() => { const nc = contextFiles.filter((_, i) => i !== idx); setContextFiles(nc); updateField({ contextFiles: nc }); }}
                                  style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}
                              ><span className="codicon codicon-trash" style={{ fontSize: '12px' }}></span></button>
                          </div>
                      ))}
                  </div>
              </div>
            </div>

            {/* Terminal Output */}
            {logs.length > 0 && (
              <div className="nodrag" style={{ marginTop: '8px' }}>
                  <div
                      onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                      style={{
                          fontSize: '10px', padding: '10px 14px', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: 'rgba(0,0,0,0.5)', color: '#aaa', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none', fontWeight: 'bold', letterSpacing: '1px'
                      }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`codicon codicon-terminal-view`} style={{ fontSize: '12px', color: '#bb86fc' }}></span>
                          LIVE AGENT STREAM
                      </span>
                      <span className={`codicon codicon-chevron-${isConsoleOpen ? 'down' : 'up'}`} style={{ fontSize: '10px', opacity: 0.5 }}></span>
                  </div>
                  {isConsoleOpen && (
                      <div
                          ref={logsRef}
                          style={{
                              maxHeight: '200px', overflowY: 'auto', background: '#020204',
                              color: '#fff', padding: '14px', fontSize: '11px',
                              fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                              whiteSpace: 'pre-wrap', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
                              border: '1px solid rgba(255,255,255,0.05)', borderTop: 'none',
                              boxShadow: 'inset 0 10px 30px rgba(0,0,0,0.8)',
                              scrollbarWidth: 'thin'
                          }}>
                          {logs.map((log: any, i: number) => (
                              <div key={i} style={{ 
                                  color: log.stream === 'stderr' ? '#ff5555' : (log.text.includes('Success') || log.text.includes('completed') ? '#50fa7b' : '#f8f8f2'),
                                  marginBottom: '4px',
                                  lineHeight: '1.5',
                                  opacity: log.text.includes('Thinking') ? 0.6 : 1
                              }}>
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

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(187, 134, 252, 0.6); }
          70% { box-shadow: 0 0 0 15px rgba(187, 134, 252, 0); }
          100% { box-shadow: 0 0 0 0 rgba(187, 134, 252, 0); }
        }
        .codicon-loading.spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default memo(AgentNode);

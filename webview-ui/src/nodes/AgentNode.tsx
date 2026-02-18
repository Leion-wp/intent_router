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

const CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex (current)' },
  { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
  { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max' },
  { value: 'gpt-5.2', label: 'gpt-5.2' },
  { value: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' }
];

const AGENT_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini CLI' },
  { value: 'codex', label: 'Codex CLI' }
];

const AGENT_ROLE_OPTIONS = [
  { value: 'brainstorm', label: 'brainstorm' },
  { value: 'prd', label: 'prd' },
  { value: 'architect', label: 'architect' },
  { value: 'backend', label: 'backend' },
  { value: 'frontend', label: 'frontend' },
  { value: 'reviewer', label: 'reviewer' },
  { value: 'qa', label: 'qa' }
];

const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'extra_high', label: 'Extra High' }
];

const OUTPUT_CONTRACT_OPTIONS = [
  { value: 'path_result', label: 'Path/Result (strict)' },
  { value: 'unified_diff', label: 'Unified Diff (strict)' }
];

const AgentNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { getAvailableVars, isRunPreviewNode } = useContext(FlowRuntimeContext);

  const [agent, setAgent] = useState<string>((data.agent as string) || 'gemini');
  const [model, setModel] = useState<string>((data.model as string) || 'gemini-2.5-flash');
  const [role, setRole] = useState<string>((data.role as string) || 'architect');
  const [reasoningEffort, setReasoningEffort] = useState<string>((data.reasoningEffort as string) || 'medium');
  const [instruction, setInstruction] = useState<string>((data.instruction as string) || '');
  const [instructionTemplate, setInstructionTemplate] = useState<string>((data.instructionTemplate as string) || '');
  const [contextFiles, setContextFiles] = useState<string[]>((data.contextFiles as string[]) || ['src/**/*.ts']);
  const [agentSpecFiles, setAgentSpecFiles] = useState<string[]>((data.agentSpecFiles as string[]) || ['AGENTS.md', '**/SKILL.md']);
  const [outputContract, setOutputContract] = useState<string>((data.outputContract as string) || 'path_result');
  const [outputVar, setOutputVar] = useState<string>((data.outputVar as string) || 'ai_result');
  const [outputVarPath, setOutputVarPath] = useState<string>((data.outputVarPath as string) || 'ai_path');
  const [outputVarChanges, setOutputVarChanges] = useState<string>((data.outputVarChanges as string) || 'ai_changes');
  const [sessionId, setSessionId] = useState<string>((data.sessionId as string) || '');
  const [sessionMode, setSessionMode] = useState<'runtime_only' | 'read_only' | 'write_only' | 'read_write'>(
    ((data.sessionMode as any) || 'read_write')
  );
  const [sessionResetBeforeRun, setSessionResetBeforeRun] = useState<boolean>(data.sessionResetBeforeRun === true);
  const [sessionRecallLimit, setSessionRecallLimit] = useState<number>(Number(data.sessionRecallLimit || 12));
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || 'AI Agent');
  const [editingLabel, setEditingLabel] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const logsRef = useRef<HTMLDivElement>(null);
  const collapsed = !!data.collapsed;
  const activeModelOptions = useMemo(
    () => (agent === 'codex' ? CODEX_MODEL_OPTIONS : MODEL_OPTIONS),
    [agent]
  );

  useEffect(() => {
    if (data.agent) setAgent(data.agent as string);
    if (data.model) setModel(data.model as string);
    if (data.role !== undefined) setRole(String(data.role || 'architect'));
    if (data.reasoningEffort !== undefined) setReasoningEffort(String(data.reasoningEffort || 'medium'));
    if (data.instruction) setInstruction(data.instruction as string);
    if (data.instructionTemplate !== undefined) setInstructionTemplate(String(data.instructionTemplate || ''));
    if (data.contextFiles) setContextFiles(data.contextFiles as string[]);
    if (data.agentSpecFiles) setAgentSpecFiles(data.agentSpecFiles as string[]);
    if (data.outputContract) setOutputContract(data.outputContract as string);
    if (data.outputVar) setOutputVar(data.outputVar as string);
    if (data.outputVarPath) setOutputVarPath(data.outputVarPath as string);
    if (data.outputVarChanges) setOutputVarChanges(data.outputVarChanges as string);
    if (data.sessionId !== undefined) setSessionId(String(data.sessionId || ''));
    if (data.sessionMode !== undefined) {
      const raw = String(data.sessionMode || 'read_write');
      setSessionMode(raw === 'runtime_only' || raw === 'read_only' || raw === 'write_only' ? raw : 'read_write');
    }
    if (data.sessionResetBeforeRun !== undefined) setSessionResetBeforeRun(data.sessionResetBeforeRun === true);
    if (data.sessionRecallLimit !== undefined) {
      const value = Number(data.sessionRecallLimit || 12);
      setSessionRecallLimit(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 12);
    }
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || 'AI Agent');

    if (data.logs && (data.logs as any[]).length > 0 && !isConsoleOpen) {
        setIsConsoleOpen(true);
    }
  }, [data]);

  const logs = (data.logs as any[]) || [];

  useEffect(() => {
    if (!activeModelOptions.some((entry) => entry.value === model)) {
      const next = activeModelOptions[0]?.value || '';
      if (!next) return;
      setModel(next);
      updateField({ model: next });
    }
  }, [activeModelOptions, model]);

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
  const themeColor = '#8a2be2';

  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '340px' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, background: themeColor, left: '-6px' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, background: '#00ff88', top: '30%', right: '-6px' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, background: '#ff4d4d', top: '70%', right: '-6px' }} />

      <div>
        {/* Header */}
        <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}22 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #bb86fc 100%)` }}>
              <span className={`codicon codicon-${isRunning ? 'loading spin' : 'sparkle'}`} style={{ color: '#fff', fontSize: '16px' }}></span>
            </div>
            
            {editingLabel ? (
              <input
                className="nodrag"
                value={label}
                autoFocus
                onChange={(e) => { setLabel(e.target.value); updateField({ label: e.target.value }); }}
                onBlur={() => setEditingLabel(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
                style={{ width: '100%' }}
              />
            ) : (
              <span onClick={() => setEditingLabel(true)} className="glass-node-label">
                {label}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="nodrag"
              onClick={() => updateField({ collapsed: !collapsed })}
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
        </div>

        {!collapsed && (
          <div className="glass-node-body">
            
            {/* Main Instruction Area */}
            <div className="glass-node-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="glass-node-input-label">System Prompt / Instruction</label>
              </div>
              <textarea
                className="nodrag"
                value={instruction}
                onChange={(e) => { setInstruction(e.target.value); updateField({ instruction: e.target.value }); }}
                placeholder="What should the agent do?"
                rows={4}
              />
            </div>

            {/* Advanced Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                  <div 
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="codicon codicon-settings-gear" style={{ fontSize: '14px' }}></span>
                          AGENT CONFIGURATION
                      </span>
                      <span className={`codicon codicon-chevron-${isSettingsOpen ? 'up' : 'down'}`} style={{ fontSize: '12px', opacity: 0.3 }}></span>
                  </div>
                  {isSettingsOpen && (
                      <div style={{ padding: '16px', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="glass-node-input-group">
                              <label className="glass-node-input-label">Provider</label>
                              <select
                                  className="nodrag"
                                  value={agent}
                                  onChange={(e) => { setAgent(e.target.value); updateField({ agent: e.target.value }); }}
                              >
                                  {AGENT_PROVIDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                          </div>
                          <div className="glass-node-input-group">
                              <label className="glass-node-input-label">Role</label>
                              <select
                                  className="nodrag"
                                  value={role}
                                  onChange={(e) => { setRole(e.target.value); updateField({ role: e.target.value }); }}
                              >
                                  {AGENT_ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                          </div>
                          <div className="glass-node-input-group">
                              <label className="glass-node-input-label">Intelligence Model</label>
                              <select
                                  className="nodrag"
                                  value={model}
                                  onChange={(e) => { setModel(e.target.value); updateField({ model: e.target.value }); }}
                              >
                                  {activeModelOptions.map(opt => (
                                    <option key={opt.value} value={opt.value} style={{ background: '#1a1a20', color: '#fff' }}>
                                      {opt.label}
                                    </option>
                                  ))}
                              </select>
                          </div>
                          {agent === 'codex' && (
                            <div className="glass-node-input-group">
                                <label className="glass-node-input-label">Reasoning Effort</label>
                                <select
                                    className="nodrag"
                                    value={reasoningEffort}
                                    onChange={(e) => {
                                      const next = String(e.target.value || 'medium');
                                      setReasoningEffort(next);
                                      updateField({ reasoningEffort: next });
                                    }}
                                >
                                    {REASONING_EFFORT_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                </select>
                            </div>
                          )}
                          <div className="glass-node-input-group">
                              <label className="glass-node-input-label">Output Contract</label>
                              <select
                                  className="nodrag"
                                  value={outputContract}
                                  onChange={(e) => { setOutputContract(e.target.value); updateField({ outputContract: e.target.value }); }}
                              >
                                  {OUTPUT_CONTRACT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                          </div>
                          
                          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                          
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                              <div className="glass-node-input-group">
                                  <label className="glass-node-input-label">Content Var</label>
                                  <input
                                      className="nodrag"
                                      value={outputVar}
                                      onChange={(e) => { setOutputVar(e.target.value); updateField({ outputVar: e.target.value }); }}
                                      placeholder="ai_msg"
                                  />
                              </div>
                              <div className="glass-node-input-group">
                                  <label className="glass-node-input-label">Path Var</label>
                                  <input
                                      className="nodrag"
                                      value={outputVarPath}
                                      onChange={(e) => { setOutputVarPath(e.target.value); updateField({ outputVarPath: e.target.value }); }}
                                      placeholder="ai_path"
                                   />
                               </div>
                               <div className="glass-node-input-group">
                                   <label className="glass-node-input-label">Changes Var</label>
                                   <input
                                       className="nodrag"
                                       value={outputVarChanges}
                                       onChange={(e) => { setOutputVarChanges(e.target.value); updateField({ outputVarChanges: e.target.value }); }}
                                       placeholder="ai_changes"
                                   />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div className="glass-node-input-group">
                                    <label className="glass-node-input-label">Session ID</label>
                                    <input
                                        className="nodrag"
                                        value={sessionId}
                                        onChange={(e) => { setSessionId(e.target.value); updateField({ sessionId: e.target.value }); }}
                                        placeholder="optional"
                                    />
                                </div>
                                <div className="glass-node-input-group">
                                    <label className="glass-node-input-label">Session Mode</label>
                                    <select
                                        className="nodrag"
                                        value={sessionMode}
                                        onChange={(e) => {
                                          const next = e.target.value === 'runtime_only' || e.target.value === 'read_only' || e.target.value === 'write_only'
                                            ? e.target.value
                                            : 'read_write';
                                          setSessionMode(next);
                                          updateField({ sessionMode: next });
                                        }}
                                    >
                                        <option value="read_write" style={{ background: '#1a1a20' }}>read/write</option>
                                        <option value="read_only" style={{ background: '#1a1a20' }}>read only</option>
                                        <option value="write_only" style={{ background: '#1a1a20' }}>write only</option>
                                        <option value="runtime_only" style={{ background: '#1a1a20' }}>runtime only</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
               </div>

              {/* Context Panels */}
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="codicon codicon-library" style={{ fontSize: '14px' }}></span>
                          KNOWLEDGE CONTEXT
                      </span>
                      <button 
                          onClick={() => { const nc = [...contextFiles, '']; setContextFiles(nc); updateField({ contextFiles: nc }); }}
                          className="nodrag"
                          style={{ background: 'var(--ir-accent-primary)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span className="codicon codicon-add" style={{ fontSize: '12px' }}></span>
                      </button>
                  </div>
                  <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                  style={{ flex: 1 }}
                              />
                              <button
                                  onClick={() => { const nc = contextFiles.filter((_, i) => i !== idx); setContextFiles(nc); updateField({ contextFiles: nc }); }}
                                  className="nodrag"
                                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                              ><span className="codicon codicon-trash" style={{ fontSize: '14px' }}></span></button>
                          </div>
                      ))}
                  </div>
              </div>
            </div>

            {/* Terminal Output */}
            {logs.length > 0 && (
              <div className="nodrag" style={{ marginTop: '4px' }}>
                  <div
                      onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                      style={{
                          fontSize: '11px', padding: '10px 14px', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.6)', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none', fontWeight: 600
                      }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`codicon codicon-terminal-view`} style={{ fontSize: '14px', color: themeColor }}></span>
                          LIVE STREAM
                      </span>
                      <span className={`codicon codicon-chevron-${isConsoleOpen ? 'down' : 'up'}`} style={{ fontSize: '10px', opacity: 0.3 }}></span>
                  </div>
                  {isConsoleOpen && (
                      <div
                          ref={logsRef}
                          style={{
                              maxHeight: '180px', overflowY: 'auto', background: 'rgba(0,0,0,0.4)',
                              color: 'rgba(255,255,255,0.8)', padding: '12px', fontSize: '11px',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
                              border: '1px solid rgba(255,255,255,0.05)', borderTop: 'none',
                              lineHeight: '1.5'
                          }}>
                          {logs.map((log: any, i: number) => (
                              <div key={i} style={{ 
                                  color: log.stream === 'stderr' ? '#ff4d4d' : (log.text.includes('Success') || log.text.includes('completed') ? '#00ff88' : 'inherit'),
                                  marginBottom: '4px'
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
        .spin {
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

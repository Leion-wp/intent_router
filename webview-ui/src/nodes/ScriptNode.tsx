import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import IoSpec from '../components/IoSpec';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: 'var(--ir-status-running)',
  success: 'var(--ir-status-success)',
  failure: 'var(--ir-status-error)',
  error: 'var(--ir-status-error)'
};

const toArgsString = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '')).join(' ');
  }
  return String(value ?? '');
};

const ScriptNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { isRunPreviewNode } = useContext(FlowRuntimeContext);
  const [scriptPath, setScriptPath] = useState<string>(String((data as any)?.scriptPath || ''));
  const [args, setArgs] = useState<string>(toArgsString((data as any)?.args));
  const [cwd, setCwd] = useState<string>(String((data as any)?.cwd || ''));
  const [interpreter, setInterpreter] = useState<string>(String((data as any)?.interpreter || ''));
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    setScriptPath(String((data as any)?.scriptPath || ''));
    setArgs(toArgsString((data as any)?.args));
    setCwd(String((data as any)?.cwd || ''));
    setInterpreter(String((data as any)?.interpreter || ''));
    setStatus(String((data as any)?.status || 'idle'));
  }, [data]);

  const borderColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.idle;
  const previewGlow = isRunPreviewNode(id) ? '0 0 0 3px rgba(0, 153, 255, 0.35)' : 'none';

  const inferredInterpreter = useMemo(() => {
    const lower = scriptPath.toLowerCase();
    if (lower.endsWith('.ps1')) return 'pwsh -File';
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.js')) return 'node';
    if (lower.endsWith('.sh')) return 'bash';
    return '';
  }, [scriptPath]);

  const effectiveInterpreter = String(interpreter || '').trim() || inferredInterpreter;
  const inputHandles = ['in', 'scriptPath', 'args', 'cwd', 'interpreter'];
  const handleTop = (index: number, total: number) => {
    if (total <= 1) return '50%';
    const min = 22;
    const max = 84;
    const value = min + ((max - min) * index) / (total - 1);
    return `${value}%`;
  };

  const browseScript = () => {
    if (!window.vscode) {
      return;
    }

    const msg: WebviewOutboundMessage = {
      type: 'selectPath',
      id,
      argName: 'scriptPath'
    };
    window.vscode.postMessage(msg);

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!isInboundMessage(message)) {
        return;
      }
      if (message.type === 'pathSelected' && message.id === id && message.argName === 'scriptPath') {
        const next = String(message.path || '');
        setScriptPath(next);
        updateNodeData(id, { scriptPath: next });
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
  };

  const sharedInputStyle = {
    width: '100%',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    padding: '6px',
    fontSize: '11px'
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
        border: `1.5px solid ${status === 'running' ? '#ffcc00' : 'rgba(255, 165, 0, 0.4)'}`,
        boxShadow: status === 'running' ? `0 0 20px rgba(255, 204, 0, 0.4)` : `0 8px 32px rgba(0, 0, 0, 0.45)`,
        minWidth: '300px',
        color: '#e0e0e0',
        fontFamily: 'var(--vscode-font-family)',
        transition: 'all 0.3s ease'
      }}
    >
      {inputHandles.map((inputName, index) => (
        <div key={`in-${inputName}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={inputName === 'in' ? 'in' : `in_${inputName}`}
            style={{ ...handleStyle, top: handleTop(index, inputHandles.length), left: '-5px', background: '#ffa500' }}
          />
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, top: '30%', right: '-5px', background: 'var(--ir-status-error)' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '50%', right: '-5px', background: 'var(--ir-status-success)' }} />

      <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ 
          padding: '10px 12px', 
          background: 'rgba(255, 165, 0, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '50%', 
              background: '#ffa500',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="codicon codicon-file-code" style={{ color: '#fff', fontSize: '14px' }}></span>
            </div>
            <span style={{ fontSize: '13px', letterSpacing: '0.4px' }}>SCRIPT</span>
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
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Script path</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
                <input
                  className="nodrag"
                  value={scriptPath}
                  onChange={(e) => {
                    const next = e.target.value;
                    setScriptPath(next);
                    updateNodeData(id, { scriptPath: next });
                  }}
                  placeholder="./scripts/build.ps1"
                  style={{ ...sharedInputStyle, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                />
                <button
                  className="nodrag"
                  onClick={browseScript}
                  style={{
                    padding: '0 10px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#ccc',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    borderRadius: '4px'
                  }}
                >
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Args</label>
              <input
                className="nodrag"
                value={args}
                onChange={(e) => {
                  const next = e.target.value;
                  setArgs(next);
                  updateNodeData(id, { args: next });
                }}
                placeholder="--flag value"
                style={{ ...sharedInputStyle, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              />
            </div>

            <div style={{ opacity: 0.6 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Working directory</label>
              <input
                className="nodrag"
                value={cwd}
                onChange={(e) => {
                  const next = e.target.value;
                  setCwd(next);
                  updateNodeData(id, { cwd: next });
                }}
                placeholder="."
                style={{ ...sharedInputStyle, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Interpreter</label>
              <input
                className="nodrag"
                value={interpreter}
                onChange={(e) => {
                  const next = e.target.value;
                  setInterpreter(next);
                  updateNodeData(id, { interpreter: next });
                }}
                placeholder={inferredInterpreter || 'Auto'}
                style={{ ...sharedInputStyle, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ScriptNode);

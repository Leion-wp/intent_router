import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';

const STATUS_COLORS = {
  idle: 'var(--vscode-editor-foreground)',
  running: '#007acc',
  success: '#4caf50',
  failure: '#f44336'
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

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: '5px',
        background: 'var(--vscode-editor-background)',
        border: `2px solid ${borderColor}`,
        boxShadow: status === 'running' ? `0 0 10px ${borderColor}, ${previewGlow}` : previewGlow,
        minWidth: '290px',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)'
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} id="failure" style={{ top: '30%', background: '#f44336' }} />
      <Handle type="source" position={Position.Right} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
          <span className="codicon codicon-file-code"></span>
          <span>Script</span>
        </div>
        <button
          className="nodrag"
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          style={{
            background: 'none',
            border: '1px solid var(--vscode-panel-border)',
            color: 'var(--vscode-foreground)',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '11px',
            padding: '2px 6px'
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Script path</div>
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
                style={sharedInputStyle}
              />
              <button
                className="nodrag"
                onClick={browseScript}
                style={{
                  padding: '0 10px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: '1px solid var(--vscode-button-border)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  borderRadius: '4px'
                }}
              >
                Browse
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Args</div>
            <input
              className="nodrag"
              value={args}
              onChange={(e) => {
                const next = e.target.value;
                setArgs(next);
                updateNodeData(id, { args: next });
              }}
              placeholder="--flag value"
              style={sharedInputStyle}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Working directory (optional)</div>
            <input
              className="nodrag"
              value={cwd}
              onChange={(e) => {
                const next = e.target.value;
                setCwd(next);
                updateNodeData(id, { cwd: next });
              }}
              placeholder="."
              style={sharedInputStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Interpreter override (optional)</div>
            <input
              className="nodrag"
              value={interpreter}
              onChange={(e) => {
                const next = e.target.value;
                setInterpreter(next);
                updateNodeData(id, { interpreter: next });
              }}
              placeholder={inferredInterpreter || 'Auto by extension'}
              style={sharedInputStyle}
            />
            <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '4px' }}>
              Inferred: {effectiveInterpreter || 'unknown extension (set override)'}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default memo(ScriptNode);

import { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

const ApprovalNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { isRunPreviewNode, vscode } = useContext(FlowRuntimeContext);

  const [filePath, setFilePath] = useState<string>((data.filePath as string) || '');
  const [proposal, setProposedContent] = useState<string>((data.proposal as string) || '');
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || 'Review Change');
  
  const collapsed = !!data.collapsed;

  useEffect(() => {
    if (data.filePath) setFilePath(data.filePath as string);
    if (data.proposal) setProposedContent(data.proposal as string);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || 'Review Change');
  }, [data]);

  const updateField = (patch: Record<string, any>) => {
    updateNodeData(id, patch);
  };

  const handleDecision = (decision: 'approve' | 'reject') => {
    if (vscode) {
        vscode.postMessage({
            type: 'pipelineDecision',
            nodeId: id,
            decision: decision
        });
    }
  };

  const isRunning = status === 'running';
  const themeColor = '#ff9800'; // Gold/Orange

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
      background: 'rgba(30, 20, 10, 0.9)',
      backdropFilter: 'blur(16px)',
      border: `2px solid ${isRunning ? '#ffcc00' : 'rgba(255, 152, 0, 0.4)'}`,
      boxShadow: isRunning 
        ? `0 0 30px rgba(255, 204, 0, 0.4), inset 0 0 15px rgba(255, 204, 0, 0.1)` 
        : `0 10px 40px rgba(0, 0, 0, 0.6)`,
      minWidth: '300px',
      color: '#efefef',
      fontFamily: 'var(--vscode-font-family)',
      transition: 'all 0.4s ease'
    }}>
      {/* Handles */}
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-10px' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, background: '#4caf50', top: '50%', right: '-10px' }} />

      <div style={{ borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ 
          padding: '12px 14px', 
          background: 'rgba(255, 152, 0, 0.15)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{ 
              width: '26px', height: '24px', borderRadius: '6px', 
              background: themeColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className={`codicon codicon-shield`} style={{ fontSize: '14px', color: '#fff' }}></span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '0.5px' }}>{label}</span>
          </div>
        </div>

        {!collapsed && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Target File */}
            <div>
                <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>TARGET FILE</label>
                <input
                    className="nodrag"
                    value={filePath}
                    onChange={(e) => { setFilePath(e.target.value); updateField({ filePath: e.target.value }); }}
                    placeholder="src/components/MyComponent.tsx"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                />
            </div>

            {/* Proposed Content (Variable) */}
            <div>
                <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>PROPOSED CONTENT</label>
                <input
                    className="nodrag"
                    value={proposal}
                    onChange={(e) => { setProposedContent(e.target.value); updateField({ proposal: e.target.value }); }}
                    placeholder="${var:ai_result}"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: themeColor, border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '6px', fontSize: '11px' }}
                />
            </div>

            {isRunning && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    <div style={{ 
                        padding: '8px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', 
                        borderRadius: '6px', color: themeColor, fontSize: '11px', textAlign: 'center'
                    }}>
                        <span className="codicon codicon-eye" style={{ marginRight: '8px' }}></span>
                        Review required
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            className="nodrag"
                            onClick={() => handleDecision('approve')}
                            style={{ 
                                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', 
                                background: '#4caf50', color: '#fff', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-check"></span> Approve
                        </button>
                        <button 
                            className="nodrag"
                            onClick={() => handleDecision('reject')}
                            style={{ 
                                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', 
                                background: '#f44336', color: '#fff', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-close"></span> Reject
                        </button>
                    </div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ApprovalNode);

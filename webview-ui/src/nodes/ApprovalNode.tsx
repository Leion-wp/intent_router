import { memo, useState, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FlowEditorContext, FlowRuntimeContext } from '../App';

function normalizePathKey(value: string): string {
  return String(value || '').replace(/\\/g, '/').trim().toLowerCase();
}

const ApprovalNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const { isRunPreviewNode, vscode } = useContext(FlowRuntimeContext);

  const [filePath, setFilePath] = useState<string>((data.filePath as string) || '');
  const [proposal, setProposedContent] = useState<string>((data.proposal as string) || '');
  const [status, setStatus] = useState<string>((data.status as string) || 'idle');
  const [label, setLabel] = useState<string>((data.label as string) || 'Review Change');
  const [reviewRunId, setReviewRunId] = useState<string>((data.reviewRunId as string) || '');
  const [reviewFiles, setReviewFiles] = useState<Array<{ path: string; added: number; removed: number }>>(
    Array.isArray(data.reviewFiles) ? (data.reviewFiles as Array<{ path: string; added: number; removed: number }>) : []
  );
  const [fileDecisions, setFileDecisions] = useState<Record<string, 'approve' | 'reject'>>({});
  const [viewedPaths, setViewedPaths] = useState<Record<string, boolean>>({});
  const [reviewPolicyMode, setReviewPolicyMode] = useState<'warn' | 'block'>(((data.reviewPolicyMode as 'warn' | 'block') || 'warn'));
  const [reviewPolicyBlocked, setReviewPolicyBlocked] = useState<boolean>(!!data.reviewPolicyBlocked);
  const [reviewPolicyViolations, setReviewPolicyViolations] = useState<string[]>(
    Array.isArray(data.reviewPolicyViolations) ? (data.reviewPolicyViolations as string[]) : []
  );
  const [reviewTotals, setReviewTotals] = useState<{ added: number; removed: number }>(() => {
    const incoming = (data.reviewTotals as any) || {};
    return {
      added: Number(incoming?.added || 0),
      removed: Number(incoming?.removed || 0)
    };
  });
  
  const collapsed = !!data.collapsed;

  useEffect(() => {
    if (data.filePath) setFilePath(data.filePath as string);
    if (data.proposal) setProposedContent(data.proposal as string);
    if (data.status) setStatus(data.status as string);
    if (data.label !== undefined) setLabel((data.label as string) || 'Review Change');
    setReviewRunId(String(data.reviewRunId || ''));
    const nextFiles = Array.isArray(data.reviewFiles) ? (data.reviewFiles as Array<{ path: string; added: number; removed: number }>) : [];
    setReviewFiles(nextFiles);
    setFileDecisions((prev) => {
      const next: Record<string, 'approve' | 'reject'> = {};
      for (const entry of nextFiles) {
        const key = String(entry.path || '');
        next[key] = prev[key] || 'approve';
      }
      return next;
    });
    setViewedPaths((prev) => {
      const next: Record<string, boolean> = {};
      for (const entry of nextFiles) {
        const key = normalizePathKey(String(entry.path || ''));
        next[key] = !!prev[key];
      }
      return next;
    });
    setReviewPolicyMode(((data.reviewPolicyMode as 'warn' | 'block') || 'warn'));
    setReviewPolicyBlocked(!!data.reviewPolicyBlocked);
    setReviewPolicyViolations(Array.isArray(data.reviewPolicyViolations) ? (data.reviewPolicyViolations as string[]) : []);
    const incomingTotals = (data.reviewTotals as any) || {};
    setReviewTotals({
      added: Number(incomingTotals?.added || 0),
      removed: Number(incomingTotals?.removed || 0)
    });
  }, [data]);

  const updateField = (patch: Record<string, any>) => {
    updateNodeData(id, patch);
  };

  const handleDecision = (decision: 'approve' | 'reject', approvedPaths?: string[]) => {
    if (vscode) {
        vscode.postMessage({
            type: 'pipelineDecision',
            nodeId: id,
            runId: reviewRunId || undefined,
            approvedPaths,
            decision: decision
        });
    }
  };

  const openDiff = (targetPath?: string) => {
    if (!vscode) return;
    if (targetPath) {
      setViewedPaths((prev) => ({ ...prev, [normalizePathKey(targetPath)]: true }));
    } else {
      const allViewed: Record<string, boolean> = {};
      for (const entry of reviewFiles) {
        allViewed[normalizePathKey(String(entry.path || ''))] = true;
      }
      setViewedPaths(allViewed);
    }
    vscode.postMessage({
      type: 'pipelineReviewOpenDiff',
      nodeId: id,
      runId: reviewRunId || undefined,
      path: targetPath
    });
  };

  const isRunning = status === 'running';
  const approvedPaths = reviewFiles
    .map((entry) => String(entry.path || ''))
    .filter((entryPath) => fileDecisions[entryPath] === 'approve');
  const viewedApprovedPaths = reviewFiles
    .map((entry) => String(entry.path || ''))
    .filter((entryPath) => fileDecisions[entryPath] === 'approve' && viewedPaths[normalizePathKey(entryPath)]);
  const rejectedPaths = reviewFiles
    .map((entry) => String(entry.path || ''))
    .filter((entryPath) => fileDecisions[entryPath] === 'reject');
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

            {isRunning && reviewFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    <div style={{ 
                        padding: '8px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', 
                        borderRadius: '6px', color: themeColor, fontSize: '11px', textAlign: 'center'
                    }}>
                        <span className="codicon codicon-eye" style={{ marginRight: '8px' }}></span>
                        Review required ({reviewFiles.length} file{reviewFiles.length > 1 ? 's' : ''})
                    </div>
                    {reviewPolicyViolations.length > 0 && (
                      <div style={{
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        border: reviewPolicyBlocked ? '1px solid rgba(244,67,54,0.5)' : '1px solid rgba(255,193,7,0.45)',
                        background: reviewPolicyBlocked ? 'rgba(244,67,54,0.15)' : 'rgba(255,193,7,0.14)',
                        color: reviewPolicyBlocked ? '#ff8a80' : '#ffe082'
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                          Policy {reviewPolicyMode.toUpperCase()}: {reviewPolicyBlocked ? 'BLOCKED' : 'WARN'}
                        </div>
                        {reviewPolicyViolations.map((entry, idx) => (
                          <div key={`${entry}-${idx}`}>• {entry}</div>
                        ))}
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontSize: '11px',
                      color: '#d2d2d2'
                    }}>
                      <span>Total</span>
                      <span>
                        <span style={{ color: '#4caf50' }}>+{reviewTotals.added}</span>{' '}
                        <span style={{ color: '#f44336' }}>-{reviewTotals.removed}</span>
                      </span>
                    </div>
                    {reviewFiles.map((entry, idx) => {
                      const pathKey = String(entry.path || '');
                      const decision = fileDecisions[pathKey] || 'approve';
                      const viewed = !!viewedPaths[normalizePathKey(pathKey)];
                      return (
                      <div
                        key={`${pathKey}-${idx}`}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '8px',
                          background: 'rgba(0,0,0,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ fontSize: '11px', color: '#efefef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.path}
                          {viewed && (
                            <span style={{
                              marginLeft: '6px',
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '999px',
                              border: '1px solid rgba(66,165,245,0.5)',
                              background: 'rgba(66,165,245,0.2)',
                              color: '#90caf9'
                            }}>
                              viewed
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#c0c0c0' }}>
                              <span style={{ color: '#4caf50' }}>+{entry.added}</span>{' '}
                              <span style={{ color: '#f44336' }}>-{entry.removed}</span>
                            </span>
                            <button
                              className="nodrag"
                              onClick={() => setFileDecisions((prev) => ({ ...prev, [pathKey]: 'approve' }))}
                              title="Approve file"
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '6px',
                                border: decision === 'approve' ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.15)',
                                background: decision === 'approve' ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.06)',
                                color: decision === 'approve' ? '#4caf50' : '#bdbdbd',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <span className="codicon codicon-check"></span>
                            </button>
                            <button
                              className="nodrag"
                              onClick={() => setFileDecisions((prev) => ({ ...prev, [pathKey]: 'reject' }))}
                              title="Reject file"
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '6px',
                                border: decision === 'reject' ? '1px solid #f44336' : '1px solid rgba(255,255,255,0.15)',
                                background: decision === 'reject' ? 'rgba(244,67,54,0.2)' : 'rgba(255,255,255,0.06)',
                                color: decision === 'reject' ? '#f44336' : '#bdbdbd',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <span className="codicon codicon-close"></span>
                            </button>
                          </div>
                          <button
                            className="nodrag"
                            onClick={() => openDiff(pathKey)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.18)',
                              background: 'rgba(255,255,255,0.08)',
                              color: '#fff',
                              fontSize: '10px',
                              cursor: 'pointer'
                            }}
                          >
                            Open diff
                          </button>
                        </div>
                      </div>
                    )})}
                    <button
                      className="nodrag"
                      onClick={() => openDiff(undefined)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Open all diffs
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#bdbdbd' }}>
                      <span>Approved: {approvedPaths.length}</span>
                      <span>Rejected: {rejectedPaths.length}</span>
                      <span>Viewed: {Object.values(viewedPaths).filter(Boolean).length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="nodrag"
                            onClick={() => {
                              const allApproved: Record<string, 'approve' | 'reject'> = {};
                              for (const entry of reviewFiles) {
                                allApproved[String(entry.path || '')] = 'approve';
                              }
                              setFileDecisions(allApproved);
                            }}
                            style={{
                                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(76,175,80,0.5)',
                                background: 'rgba(76,175,80,0.12)', color: '#4caf50', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-check"></span> Approve all
                        </button>
                        <button
                            className="nodrag"
                            onClick={() => handleDecision('approve', viewedApprovedPaths)}
                            disabled={viewedApprovedPaths.length === 0 || reviewPolicyBlocked}
                            style={{
                                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(33,150,243,0.45)',
                                background: viewedApprovedPaths.length > 0 && !reviewPolicyBlocked ? 'rgba(33,150,243,0.22)' : 'rgba(33,150,243,0.12)',
                                color: '#90caf9', fontWeight: 'bold',
                                cursor: viewedApprovedPaths.length > 0 && !reviewPolicyBlocked ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-eye"></span> Approve viewed
                        </button>
                        <button 
                            className="nodrag"
                            onClick={() => handleDecision('approve', approvedPaths)}
                            disabled={approvedPaths.length === 0 || reviewPolicyBlocked}
                            style={{ 
                                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', 
                                background: approvedPaths.length > 0 && !reviewPolicyBlocked ? '#4caf50' : 'rgba(76,175,80,0.35)',
                                color: '#fff', fontWeight: 'bold', cursor: approvedPaths.length > 0 && !reviewPolicyBlocked ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-check"></span> Approve selected
                        </button>
                        <button 
                            className="nodrag"
                            onClick={() => handleDecision('reject', [])}
                            style={{ 
                                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', 
                                background: '#f44336', color: '#fff', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            <span className="codicon codicon-close"></span> Reject all
                        </button>
                    </div>
                </div>
            )}

            {isRunning && reviewFiles.length === 0 && (
              <div style={{ 
                padding: '8px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', 
                borderRadius: '6px', color: themeColor, fontSize: '11px', textAlign: 'center', marginTop: '10px'
              }}>
                <span className="codicon codicon-sync" style={{ marginRight: '8px' }}></span>
                Preparing review summary...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ApprovalNode);

import React from 'react';
import { getResumeFromFailedStepId } from '../../utils/historyListUtils';

type HistoryPanelProps = {
  historySearch: string;
  onHistorySearchChange: (value: string) => void;
  filteredHistory: any[];
  historyContainerRef: React.RefObject<HTMLDivElement | null>;
  onHistoryViewportUpdate: (el: HTMLDivElement | null) => void;
  onHistoryScroll: (top: number) => void;
  historyTotalHeight: number;
  historyStartIndex: number;
  historyWindow: any[];
  historyRowHeight: number;
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
  onResumeHistory?: (run: any, startStepId: string) => void;
  onOpenExternal?: (url: string) => void;
  onCopyToClipboard?: (text: string) => void;
  onExportRunAudit?: (runId: string) => void;
  onFetchPrChecks?: (url: string) => void;
  onRerunPrChecks?: (url: string) => void;
  onCommentPr?: (url: string) => void;
};

function HistoryPanel({
  historySearch,
  onHistorySearchChange,
  filteredHistory,
  historyContainerRef,
  onHistoryViewportUpdate,
  onHistoryScroll,
  historyTotalHeight,
  historyStartIndex,
  historyWindow,
  historyRowHeight,
  onSelectHistory,
  onRestoreHistory,
  onResumeHistory,
  onOpenExternal,
  onCopyToClipboard,
  onExportRunAudit,
  onFetchPrChecks,
  onRerunPrChecks,
  onCommentPr
}: HistoryPanelProps) {
  return (
    <div className="sidebar-list" style={{ minHeight: '220px' }}>
      <input
        className="nodrag"
        value={historySearch}
        onChange={(event) => onHistorySearchChange(event.target.value)}
        placeholder="Search history..."
        aria-label="Search run history"
        style={{
          width: '100%',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          padding: '6px',
          fontSize: '11px',
          borderRadius: '4px'
        }}
      />
      {filteredHistory.length === 0 && <div style={{ opacity: 0.6, fontSize: '12px', padding: '8px' }}>No history available.</div>}
      {filteredHistory.length > 0 && (
        <div
          ref={(el) => {
            historyContainerRef.current = el;
            onHistoryViewportUpdate(el);
          }}
          role="list"
          aria-label="Pipeline run history"
          style={{ height: 'calc(100vh - 280px)', minHeight: '220px', maxHeight: '60vh', overflowY: 'auto', position: 'relative' }}
          onScroll={(event) => onHistoryScroll((event.currentTarget as HTMLDivElement).scrollTop)}
        >
          <div style={{ height: `${historyTotalHeight}px`, position: 'relative' }}>
            {historyWindow.map((run: any, localIndex: number) => {
              const absoluteIndex = historyStartIndex + localIndex;
              const pullRequests = Array.isArray(run.pullRequests) ? run.pullRequests : [];
              const estimatedCost = Number(run?.audit?.cost?.estimatedTotal || 0);
              const timelineCount = Array.isArray(run?.audit?.timeline) ? run.audit.timeline.length : 0;
              const hitlCount = Array.isArray(run?.audit?.hitl) ? run.audit.hitl.length : 0;
              const resumeStepId = getResumeFromFailedStepId(run);
              const canResumeFromFailure = !!run.pipelineSnapshot && !!resumeStepId;
              const visiblePrs = pullRequests.slice(0, 2);
              const hiddenPrCount = Math.max(0, pullRequests.length - visiblePrs.length);
              return (
                <div
                  key={String(run.id || absoluteIndex)}
                  role="button"
                  tabIndex={0}
                  className="history-row"
                  onClick={() => onSelectHistory?.({ ...run })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectHistory?.({ ...run });
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: `${absoluteIndex * historyRowHeight}px`,
                    left: 0,
                    right: 0,
                    padding: '8px',
                    background: 'var(--vscode-list-hoverBackground)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    border: '1px solid transparent',
                    marginBottom: '8px',
                    minHeight: `${historyRowHeight - 8}px`,
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (run.pipelineSnapshot) {
                          onRestoreHistory?.(run);
                        }
                      }}
                      disabled={!run.pipelineSnapshot}
                      title={run.pipelineSnapshot ? 'Restore this snapshot in the builder' : 'No snapshot available for this run'}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: '1px solid var(--vscode-panel-border)',
                        background: run.pipelineSnapshot ? 'var(--vscode-button-background)' : 'transparent',
                        color: run.pipelineSnapshot ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                        cursor: run.pipelineSnapshot ? 'pointer' : 'not-allowed',
                        opacity: run.pipelineSnapshot ? 1 : 0.6
                      }}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canResumeFromFailure && resumeStepId) {
                          onResumeHistory?.(run, resumeStepId);
                        }
                      }}
                      disabled={!canResumeFromFailure}
                      title={
                        canResumeFromFailure
                          ? `Resume from failed step: ${resumeStepId}`
                          : 'No failed step with stepId found'
                      }
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: '1px solid var(--vscode-panel-border)',
                        background: canResumeFromFailure ? 'var(--vscode-button-secondaryBackground)' : 'transparent',
                        color: canResumeFromFailure ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
                        cursor: canResumeFromFailure ? 'pointer' : 'not-allowed',
                        opacity: canResumeFromFailure ? 1 : 0.6
                      }}
                    >
                      Resume failed
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportRunAudit?.(String(run.id || ''));
                      }}
                      title="Export run audit JSON to clipboard"
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: '1px solid var(--vscode-panel-border)',
                        background: 'transparent',
                        color: 'var(--vscode-descriptionForeground)',
                        cursor: 'pointer'
                      }}
                    >
                      Export audit
                    </button>
                  </div>
                  <div style={{ fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                    <span style={{
                      color: run.status === 'success' ? 'var(--ir-status-success)' :
                        run.status === 'failure' ? 'var(--ir-status-error)' :
                        run.status === 'cancelled' ? '#e6c300' :
                        'var(--vscode-descriptionForeground)'
                    }}>
                      {String(run.status || '').toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '3px' }}>
                    Timeline {timelineCount} · HITL {hitlCount} · Cost ~{estimatedCost.toFixed(2)}
                  </div>
                  {pullRequests.length > 0 && (
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>PRs: {pullRequests.length}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            for (const entry of pullRequests) {
                              if (entry?.url) onOpenExternal?.(String(entry.url));
                            }
                          }}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10px',
                            borderRadius: '10px',
                            border: '1px solid var(--vscode-panel-border)',
                            background: 'transparent',
                            color: 'var(--vscode-textLink-foreground)',
                            cursor: 'pointer'
                          }}
                          title="Open all PR links"
                        >
                          Open all
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCopyToClipboard?.(pullRequests.map((entry: any) => String(entry?.url || '')).filter(Boolean).join('\n'));
                          }}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10px',
                            borderRadius: '10px',
                            border: '1px solid var(--vscode-panel-border)',
                            background: 'transparent',
                            color: 'var(--vscode-descriptionForeground)',
                            cursor: 'pointer'
                          }}
                          title="Copy all PR URLs"
                        >
                          Copy URLs
                        </button>
                      </div>
                      {visiblePrs.map((entry: any, index: number) => {
                        const prTitle = String(entry?.title || entry?.url || `PR ${index + 1}`);
                        const prMeta = `${String(entry?.head || '')} → ${String(entry?.base || '')}`;
                        const prUrl = String(entry?.url || '');
                        const prNumber = Number.isFinite(Number(entry?.number)) ? Number(entry.number) : undefined;
                        const prState = String(entry?.state || '').toLowerCase();
                        const isDraft = entry?.isDraft === true;
                        const statusLabel = isDraft
                          ? 'DRAFT'
                          : (prState === 'merged' ? 'MERGED' : (prState === 'closed' ? 'CLOSED' : 'OPEN'));
                        const statusColor = isDraft
                          ? 'var(--vscode-descriptionForeground)'
                          : (prState === 'merged'
                            ? 'var(--ir-status-success)'
                            : (prState === 'closed' ? 'var(--ir-status-error)' : 'var(--vscode-textLink-foreground)'));
                        return (
                          <div
                            key={`${prUrl}-${index}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto auto auto auto auto auto',
                              gap: '4px',
                              alignItems: 'center',
                              fontSize: '10px',
                              minHeight: '20px'
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontWeight: 600
                                }}
                                title={prTitle}
                              >
                                {prNumber ? `#${prNumber} ${prTitle}` : prTitle}
                              </div>
                              <div
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  opacity: 0.7
                                }}
                                title={prMeta}
                              >
                                {prMeta}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '9px',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                color: statusColor,
                                whiteSpace: 'nowrap'
                              }}
                              title={`State: ${statusLabel}`}
                            >
                              {statusLabel}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (prUrl) onOpenExternal?.(prUrl);
                              }}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                background: 'transparent',
                                color: 'var(--vscode-textLink-foreground)',
                                cursor: 'pointer'
                              }}
                              title={prUrl}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (prUrl) onFetchPrChecks?.(prUrl);
                              }}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                background: 'transparent',
                                color: 'var(--vscode-foreground)',
                                cursor: 'pointer'
                              }}
                              title="Fetch checks summary"
                            >
                              Checks
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (prUrl) onRerunPrChecks?.(prUrl);
                              }}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                background: 'transparent',
                                color: 'var(--vscode-foreground)',
                                cursor: 'pointer'
                              }}
                              title="Re-run failed checks"
                            >
                              Re-run
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (prUrl) onCommentPr?.(prUrl);
                              }}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                background: 'transparent',
                                color: 'var(--vscode-foreground)',
                                cursor: 'pointer'
                              }}
                              title="Comment on PR"
                            >
                              Comment
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (prUrl) onCopyToClipboard?.(prUrl);
                              }}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10px',
                                borderRadius: '10px',
                                border: '1px solid var(--vscode-panel-border)',
                                background: 'transparent',
                                color: 'var(--vscode-descriptionForeground)',
                                cursor: 'pointer'
                              }}
                              title="Copy PR URL"
                            >
                              Copy
                            </button>
                          </div>
                        );
                      })}
                      {hiddenPrCount > 0 && (
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>
                          +{hiddenPrCount} more PR(s)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(HistoryPanel);

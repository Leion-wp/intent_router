import React, { useState } from 'react';
import { getResumeFromFailedStepId } from '../../utils/historyListUtils';
import { buildHistoryTree, TreeFolder, TreeLeaf } from '../../utils/treeUtils';

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

function HistoryTreeItem({ 
  item, 
  level,
  onSelectHistory,
  onRestoreHistory,
  onResumeHistory,
  onExportRunAudit,
  onOpenExternal,
  onCopyToClipboard,
  onFetchPrChecks,
  onRerunPrChecks,
  onCommentPr
}: { 
  item: TreeFolder | TreeLeaf, 
  level: number,
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
  onResumeHistory?: (run: any, startStepId: string) => void;
  onExportRunAudit?: (runId: string) => void;
  onOpenExternal?: (url: string) => void;
  onCopyToClipboard?: (text: string) => void;
  onFetchPrChecks?: (url: string) => void;
  onRerunPrChecks?: (url: string) => void;
  onCommentPr?: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (item.isFolder) {
    return (
      <div style={{ marginBottom: '2px' }}>
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            padding: '6px 8px', 
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '6px',
            marginLeft: `${level * 12}px`,
            transition: 'all 0.2s ease'
          }}
          className="folder-header"
        >
          <span className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: '12px', opacity: 0.5 }}></span>
          <span className="codicon codicon-folder" style={{ fontSize: '14px', color: 'var(--ir-accent-primary)' }}></span>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.8 }}>{item.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.3, fontWeight: 'bold' }}>[{item.children.length}]</span>
        </div>
        {isExpanded && (
          <div style={{ borderLeft: level >= 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', marginLeft: `${level * 12 + 14}px` }}>
            {item.children.map((child) => (
              <HistoryTreeItem 
                key={child.id} 
                item={child} 
                level={0} // On reset le level car on indente via le container parent
                onSelectHistory={onSelectHistory}
                onRestoreHistory={onRestoreHistory}
                onResumeHistory={onResumeHistory}
                onExportRunAudit={onExportRunAudit}
                onOpenExternal={onOpenExternal}
                onCopyToClipboard={onCopyToClipboard}
                onFetchPrChecks={onFetchPrChecks}
                onRerunPrChecks={onRerunPrChecks}
                onCommentPr={onCommentPr}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const run = item.data;
  const pullRequests = Array.isArray(run.pullRequests) ? run.pullRequests : [];
  const timelineCount = Array.isArray(run?.audit?.timeline) ? run.audit.timeline.length : 0;
  const resumeStepId = getResumeFromFailedStepId(run);
  const canResumeFromFailure = !!run.pipelineSnapshot && !!resumeStepId;

  return (
    <div
      role="button"
      tabIndex={0}
      className="history-row"
      onClick={() => onSelectHistory?.({ ...run })}
      style={{
        padding: '10px',
        background: 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '6px',
        marginTop: '2px',
        marginLeft: `${level * 12}px`,
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <div style={{ fontWeight: 700, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.9 }}>{item.name}</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="mini-action-btn"
            onClick={(e) => { e.stopPropagation(); if (run.pipelineSnapshot) onRestoreHistory?.(run); }}
            disabled={!run.pipelineSnapshot}
            title="Restore snapshot"
          >
            <span className="codicon codicon-history"></span>
          </button>
          {canResumeFromFailure && (
            <button
              type="button"
              className="mini-action-btn success"
              onClick={(e) => { e.stopPropagation(); onResumeHistory?.(run, resumeStepId); }}
              title="Resume failed"
            >
              <span className="codicon codicon-debug-continue"></span>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '10px', opacity: 0.5, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
        <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
        <span style={{
          color: run.status === 'success' ? 'var(--ir-status-success)' :
            run.status === 'failure' ? 'var(--ir-status-error)' :
            '#e6c300'
        }}>
          {String(run.status || '').toUpperCase()}
        </span>
      </div>
      
      <style>{`
        .mini-action-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #aaa;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mini-action-btn:hover {
          background: var(--ir-accent-primary);
          color: #fff;
          border-color: transparent;
        }
        .mini-action-btn.success:hover {
          background: var(--ir-accent-success);
        }
        .history-row:hover {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.1) !important;
          transform: translateX(2px);
        }
        .folder-header:hover {
          background: rgba(255,255,255,0.08) !important;
        }
      `}</style>
    </div>
  );
}

function HistoryPanel({
  historySearch,
  onHistorySearchChange,
  filteredHistory,
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
  const tree = buildHistoryTree(filteredHistory);

  return (
    <div className="sidebar-list" style={{ minHeight: '220px', gap: '16px' }}>
      <div style={{ position: 'relative' }}>
        <span className="codicon codicon-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.4, pointerEvents: 'none' }}></span>
        <input
          className="nodrag"
          value={historySearch}
          onChange={(event) => onHistorySearchChange(event.target.value)}
          placeholder="Search history..."
          aria-label="Search run history"
          style={{
            width: '100%',
            background: 'rgba(255, 255, 255, 0.03)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '10px 12px 10px 36px',
            fontSize: '12px',
            borderRadius: '999px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {filteredHistory.length === 0 && <div style={{ opacity: 0.4, fontSize: '12px', padding: '20px', textAlign: 'center' }}>No history matches your search.</div>}
      
      {filteredHistory.length > 0 && (
        <div
          role="list"
          aria-label="Pipeline run history"
          style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}
        >
          {tree.map((item) => (
            <HistoryTreeItem 
              key={item.id} 
              item={item} 
              level={0}
              onSelectHistory={onSelectHistory}
              onRestoreHistory={onRestoreHistory}
              onResumeHistory={onResumeHistory}
              onExportRunAudit={onExportRunAudit}
              onOpenExternal={onOpenExternal}
              onCopyToClipboard={onCopyToClipboard}
              onFetchPrChecks={onFetchPrChecks}
              onRerunPrChecks={onRerunPrChecks}
              onCommentPr={onCommentPr}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(HistoryPanel);

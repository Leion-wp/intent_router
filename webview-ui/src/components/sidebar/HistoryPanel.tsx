import React from 'react';

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
  onOpenExternal?: (url: string) => void;
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
  onOpenExternal
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
              const firstPr = pullRequests[0];
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
                  {pullRequests.length > 0 && (
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', opacity: 0.85 }}>PRs: {pullRequests.length}</span>
                      {firstPr?.url && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenExternal?.(String(firstPr.url));
                          }}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10px',
                            borderRadius: '10px',
                            border: '1px solid var(--vscode-panel-border)',
                            background: 'transparent',
                            color: 'var(--vscode-textLink-foreground)',
                            cursor: 'pointer',
                            maxWidth: '170px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={String(firstPr.title || firstPr.url)}
                        >
                          Open PR
                        </button>
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

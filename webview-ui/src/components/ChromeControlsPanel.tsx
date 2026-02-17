import React, { MutableRefObject } from 'react';

type ChromeControlsPanelProps = {
  chromePanelPos: { x: number; y: number };
  chromeCollapsed: boolean;
  setChromeCollapsed: (value: boolean | ((previous: boolean) => boolean)) => void;
  setChromePanelPos: (value: { x: number; y: number }) => void;
  chromePanelDragRef: MutableRefObject<{ dx: number; dy: number } | null>;
  chromeOpacity: number;
  focusGraph: boolean;
  toggleFocusGraph: () => void;
  showMiniMap: boolean;
  setShowMiniMap: (value: boolean | ((previous: boolean) => boolean)) => void;
  showControls: boolean;
  setShowControls: (value: boolean | ((previous: boolean) => boolean)) => void;
  canUndo: boolean;
  undoGraph: () => void;
  canRedo: boolean;
  redoGraph: () => void;
  selectedNodeId: string | null;
  runPipelineFromHere: (nodeId: string, dryRun?: boolean) => void;
  resetRuntimeUiState: () => void;
  setChromeOpacity: (value: number) => void;
};

function ChromeControlsPanel(props: ChromeControlsPanelProps) {
  const {
    chromePanelPos,
    chromeCollapsed,
    setChromeCollapsed,
    setChromePanelPos,
    chromePanelDragRef,
    chromeOpacity,
    focusGraph,
    toggleFocusGraph,
    showMiniMap,
    setShowMiniMap,
    showControls,
    setShowControls,
    canUndo,
    undoGraph,
    canRedo,
    redoGraph,
    selectedNodeId,
    runPipelineFromHere,
    resetRuntimeUiState,
    setChromeOpacity
  } = props;

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        top: `${chromePanelPos.y}px`,
        left: `${chromePanelPos.x}px`,
        zIndex: 940,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '16px',
        background: 'var(--ir-glass-bg)',
        backdropFilter: 'var(--ir-glass-blur)',
        border: '1px solid var(--ir-glass-border)',
        opacity: chromeOpacity,
        width: chromeCollapsed ? '240px' : '780px',
        maxWidth: 'calc(100vw - 40px)',
        boxSizing: 'border-box',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <div
        className="nodrag"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement)?.closest('button,input,select,textarea')) {
            return;
          }
          const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
          chromePanelDragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        }}
        onDoubleClick={() => setChromePanelPos({ x: 430, y: 56 })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="codicon codicon-settings-gear" style={{ fontSize: '14px', opacity: 0.7 }}></span>
          <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.3px', opacity: 0.9 }}>Chrome Controls</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="nodrag"
            onClick={() => setChromePanelPos({ x: 430, y: 56 })}
            aria-label="Reset controls panel position"
            style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              color: '#fff', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              borderRadius: '6px', 
              padding: '4px 8px', 
              cursor: 'pointer', 
              fontSize: '11px',
              fontWeight: 500
            }}
            title="Reset position"
          >
            Reset
          </button>
          <button
            type="button"
            className="nodrag"
            onClick={() => setChromeCollapsed((value: boolean) => !value)}
            aria-label={chromeCollapsed ? 'Expand controls panel' : 'Collapse controls panel'}
            style={{ 
              background: 'var(--ir-accent-primary)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '6px', 
              padding: '4px 10px', 
              cursor: 'pointer', 
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: '0 4px 10px rgba(0, 162, 255, 0.3)'
            }}
            title={chromeCollapsed ? 'Expand controls' : 'Collapse controls'}
          >
            {chromeCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>

      {!chromeCollapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.05)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.6 }}>Opacity</span>
            <input
              className="nodrag"
              type="range"
              min={30}
              max={100}
              value={Math.round(chromeOpacity * 100)}
              onChange={(event) => setChromeOpacity(Number(event.target.value) / 100)}
              style={{ width: '80px', height: '4px', accentColor: 'var(--ir-accent-primary)' }}
              aria-label="Adjust chrome controls opacity"
            />
          </div>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }} />

          <button type="button" className="nodrag chrome-btn" onClick={toggleFocusGraph}>
            <span className={`codicon codicon-${focusGraph ? 'screen-normal' : 'screen-full'}`}></span>
            {focusGraph ? 'Unfocus' : 'Focus'}
          </button>
          <button type="button" className="nodrag chrome-btn" onClick={() => setShowMiniMap((value: boolean) => !value)}>
            <span className={`codicon codicon-${showMiniMap ? 'eye' : 'eye-closed'}`}></span>
            MiniMap
          </button>
          <button type="button" className="nodrag chrome-btn" onClick={() => setShowControls((value: boolean) => !value)}>
            <span className={`codicon codicon-${showControls ? 'layers' : 'layers-dot'}`}></span>
            Controls
          </button>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }} />

          <button type="button" className="nodrag chrome-btn" onClick={undoGraph} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.4 }}>
            <span className="codicon codicon-discard"></span>
            Undo
          </button>
          <button type="button" className="nodrag chrome-btn" onClick={redoGraph} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.4 }}>
            <span className="codicon codicon-redo"></span>
            Redo
          </button>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }} />

          <button type="button" className="nodrag chrome-btn" onClick={() => selectedNodeId && runPipelineFromHere(selectedNodeId, false)} disabled={!selectedNodeId} style={{ opacity: selectedNodeId ? 1 : 0.4 }}>
            <span className="codicon codicon-play"></span>
            Run From Selection
          </button>
          <button type="button" className="nodrag chrome-btn" onClick={resetRuntimeUiState}>
            <span className="codicon codicon-refresh"></span>
            Reset States
          </button>

          <style>{`
            .chrome-btn {
              background: rgba(255, 255, 255, 0.05);
              color: #fff;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 8px;
              padding: 8px 12px;
              cursor: pointer;
              font-size: 11px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
              transition: all 0.2s ease;
            }
            .chrome-btn:hover:not(:disabled) {
              background: rgba(255, 255, 255, 0.1);
              border-color: rgba(255, 255, 255, 0.2);
              transform: translateY(-1px);
            }
            .chrome-btn:active:not(:disabled) {
              transform: translateY(0);
            }
            .chrome-btn .codicon {
              font-size: 14px;
              opacity: 0.8;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default React.memo(ChromeControlsPanel);

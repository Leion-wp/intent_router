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

export default function ChromeControlsPanel(props: ChromeControlsPanelProps) {
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
        gap: '6px',
        padding: '6px 8px',
        borderRadius: '8px',
        background: 'var(--vscode-editorWidget-background)',
        border: '1px solid var(--vscode-editorWidget-border)',
        opacity: chromeOpacity,
        width: chromeCollapsed ? '230px' : '760px',
        maxWidth: 'calc(100vw - 16px)',
        boxSizing: 'border-box'
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
        <span style={{ fontSize: '11px', opacity: 0.85 }}>Chrome controls</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="nodrag"
            onClick={() => setChromePanelPos({ x: 430, y: 56 })}
            style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
            title="Reset position"
          >
            Reset
          </button>
          <button
            className="nodrag"
            onClick={() => setChromeCollapsed((value: boolean) => !value)}
            style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
            title={chromeCollapsed ? 'Expand controls' : 'Collapse controls'}
          >
            {chromeCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>

      {!chromeCollapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Opacity
            <input className="nodrag" type="range" min={30} max={100} value={Math.round(chromeOpacity * 100)} onChange={(event) => setChromeOpacity(Number(event.target.value) / 100)} />
          </label>
          <button className="nodrag" onClick={toggleFocusGraph} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '6px 8px', cursor: 'pointer', fontSize: '11px' }}>
            {focusGraph ? 'Unfocus' : 'Focus graph'}
          </button>
          <button className="nodrag" onClick={() => setShowMiniMap((value: boolean) => !value)} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '6px 8px', cursor: 'pointer', fontSize: '11px' }}>
            {showMiniMap ? 'MiniMap on' : 'MiniMap off'}
          </button>
          <button className="nodrag" onClick={() => setShowControls((value: boolean) => !value)} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '6px 8px', cursor: 'pointer', fontSize: '11px' }}>
            {showControls ? 'Controls on' : 'Controls off'}
          </button>
          <button
            className="nodrag"
            onClick={undoGraph}
            disabled={!canUndo}
            style={{
              background: canUndo ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-input-background)',
              color: canUndo ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontSize: '11px'
            }}
            title="Undo graph change (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            className="nodrag"
            onClick={redoGraph}
            disabled={!canRedo}
            style={{
              background: canRedo ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-input-background)',
              color: canRedo ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              fontSize: '11px'
            }}
            title="Redo graph change (Ctrl+Y / Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button
            className="nodrag"
            onClick={() => selectedNodeId && runPipelineFromHere(selectedNodeId, false)}
            disabled={!selectedNodeId}
            style={{
              background: selectedNodeId ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-input-background)',
              color: selectedNodeId ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: selectedNodeId ? 'pointer' : 'not-allowed',
              fontSize: '11px'
            }}
            title={selectedNodeId ? 'Run from selected node' : 'Select a node first'}
          >
            Run selected
          </button>
          <button
            className="nodrag"
            onClick={resetRuntimeUiState}
            style={{
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
            title="Reset runtime visual statuses"
          >
            Reset state
          </button>
        </div>
      )}
    </div>
  );
}

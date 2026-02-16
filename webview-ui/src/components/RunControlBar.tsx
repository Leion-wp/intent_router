import React from 'react';
import { canRunFromSelection, getRunPillBackground, RunPillStatus } from '../utils/runMenuUtils';

type RunControlBarProps = {
  chromeOpacity: number;
  runPillStatus: RunPillStatus;
  runMenuOpen: boolean;
  setRunMenuOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  selectedNodeId: string | null;
  runPipeline: (dryRun?: boolean) => void;
  runPipelineFromHere: (nodeId: string, dryRun?: boolean) => void;
  setRunPreviewIds: (value: Set<string> | null) => void;
};

function RunControlBar(props: RunControlBarProps) {
  const {
    chromeOpacity,
    runPillStatus,
    runMenuOpen,
    setRunMenuOpen,
    selectedNodeId,
    runPipeline,
    runPipelineFromHere,
    setRunPreviewIds
  } = props;
  const runFromSelectionEnabled = canRunFromSelection(selectedNodeId);
  const pillBackground = getRunPillBackground(runPillStatus);

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        bottom: '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 980,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        opacity: chromeOpacity
      }}
    >
      <button
        type="button"
        className="nodrag"
        onClick={() => runPipeline(false)}
        aria-label="Run pipeline"
        style={{
          padding: '10px 22px',
          background: pillBackground,
          color: 'var(--ir-run-foreground)',
          border: 'none',
          borderTopLeftRadius: '999px',
          borderBottomLeftRadius: '999px',
          cursor: 'pointer',
          fontWeight: 700
        }}
      >
        Run
      </button>
      <button
        type="button"
        className="nodrag"
        onClick={(event) => {
          event.stopPropagation();
          setRunMenuOpen((value: boolean) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={runMenuOpen}
        aria-controls="intent-router-run-menu"
        aria-label="Open run options"
        style={{
          width: '34px',
          height: '38px',
          background: pillBackground,
          color: 'var(--ir-run-foreground)',
          border: 'none',
          borderTopRightRadius: '999px',
          borderBottomRightRadius: '999px',
          cursor: 'pointer',
          fontSize: '11px'
        }}
        title="Run options"
      >
        ▼
      </button>
      {runMenuOpen && (
        <div
          id="intent-router-run-menu"
          role="menu"
          className="nodrag"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setRunMenuOpen(false);
            }
          }}
          style={{
            position: 'absolute',
            bottom: '46px',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: '190px',
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-editorWidget-border)',
            borderRadius: '8px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            padding: '6px'
          }}
        >
          <button type="button" role="menuitem" className="nodrag" onClick={() => runPipeline(false)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--vscode-foreground)' }}>Run</button>
          <button type="button" role="menuitem" className="nodrag" onClick={() => runPipeline(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--vscode-foreground)' }}>Dry run</button>
          <button
            type="button"
            role="menuitem"
            className="nodrag"
            disabled={!runFromSelectionEnabled}
            onClick={() => runFromSelectionEnabled && runPipelineFromHere(String(selectedNodeId), false)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: runFromSelectionEnabled ? 'pointer' : 'not-allowed',
              color: runFromSelectionEnabled ? 'var(--vscode-foreground)' : 'var(--vscode-disabledForeground)'
            }}
          >
            Run from selection
          </button>
          <button
            type="button"
            role="menuitem"
            className="nodrag"
            disabled={!runFromSelectionEnabled}
            onClick={() => runFromSelectionEnabled && runPipelineFromHere(String(selectedNodeId), true)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: runFromSelectionEnabled ? 'pointer' : 'not-allowed',
              color: runFromSelectionEnabled ? 'var(--vscode-foreground)' : 'var(--vscode-disabledForeground)'
            }}
          >
            Dry run from selection
          </button>
          <button
            type="button"
            role="menuitem"
            className="nodrag"
            onClick={() => {
              setRunPreviewIds(null);
              setRunMenuOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--vscode-foreground)',
              opacity: 0.8
            }}
          >
            Clear highlight
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(RunControlBar);

import React from 'react';

type RunPillStatus = 'idle' | 'running' | 'success' | 'error';

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

export default function RunControlBar(props: RunControlBarProps) {
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
        className="nodrag"
        onClick={() => runPipeline(false)}
        style={{
          padding: '10px 22px',
          background: runPillStatus === 'running'
            ? 'var(--ir-run-running)'
            : runPillStatus === 'success'
              ? 'var(--ir-run-success)'
              : runPillStatus === 'error'
                ? 'var(--ir-run-error)'
                : 'var(--ir-run-idle)',
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
        className="nodrag"
        onClick={(event) => {
          event.stopPropagation();
          setRunMenuOpen((value: boolean) => !value);
        }}
        style={{
          width: '34px',
          height: '38px',
          background: runPillStatus === 'running'
            ? 'var(--ir-run-running)'
            : runPillStatus === 'success'
              ? 'var(--ir-run-success)'
              : runPillStatus === 'error'
                ? 'var(--ir-run-error)'
                : 'var(--ir-run-idle)',
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
          className="nodrag"
          onClick={(event) => event.stopPropagation()}
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
          <button className="nodrag" onClick={() => runPipeline(false)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--vscode-foreground)' }}>Run</button>
          <button className="nodrag" onClick={() => runPipeline(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--vscode-foreground)' }}>Dry run</button>
          <button
            className="nodrag"
            disabled={!selectedNodeId}
            onClick={() => selectedNodeId && runPipelineFromHere(selectedNodeId, false)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: selectedNodeId ? 'pointer' : 'not-allowed',
              color: selectedNodeId ? 'var(--vscode-foreground)' : 'var(--vscode-disabledForeground)'
            }}
          >
            Run from selection
          </button>
          <button
            className="nodrag"
            disabled={!selectedNodeId}
            onClick={() => selectedNodeId && runPipelineFromHere(selectedNodeId, true)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: selectedNodeId ? 'pointer' : 'not-allowed',
              color: selectedNodeId ? 'var(--vscode-foreground)' : 'var(--vscode-disabledForeground)'
            }}
          >
            Dry run from selection
          </button>
          <button
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

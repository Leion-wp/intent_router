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
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 980,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--ir-glass-bg)',
        backdropFilter: 'var(--ir-glass-blur)',
        border: '1px solid var(--ir-glass-border)',
        borderRadius: '999px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        padding: '4px',
        gap: '4px',
        opacity: chromeOpacity,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <button
        type="button"
        className="nodrag"
        onClick={() => runPipeline(false)}
        aria-label="Run pipeline"
        style={{
          padding: '10px 28px',
          background: pillBackground,
          color: '#fff',
          border: 'none',
          borderRadius: '999px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '14px',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          boxShadow: `0 4px 15px ${pillBackground}44`,
          transition: 'all 0.2s ease'
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
          width: '40px',
          height: '40px',
          background: 'rgba(255, 255, 255, 0.05)',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease'
        }}
        title="Run options"
      >
        <span className={`codicon codicon-chevron-${runMenuOpen ? 'down' : 'up'}`} style={{ fontSize: '14px' }}></span>
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
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: '220px',
            background: 'rgba(25, 25, 30, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            boxShadow: '0 15px 50px rgba(0,0,0,0.6)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <button type="button" role="menuitem" className="nodrag run-menu-item" onClick={() => runPipeline(false)}>
            <span className="codicon codicon-play" style={{ marginRight: '10px', opacity: 0.7 }}></span>
            Run Pipeline
          </button>
          <button type="button" role="menuitem" className="nodrag run-menu-item" onClick={() => runPipeline(true)}>
            <span className="codicon codicon-debug-start" style={{ marginRight: '10px', opacity: 0.7 }}></span>
            Dry Run
          </button>
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.05)', margin: '4px 8px' }} />
          <button
            type="button"
            role="menuitem"
            className="nodrag run-menu-item"
            disabled={!runFromSelectionEnabled}
            onClick={() => runFromSelectionEnabled && runPipelineFromHere(String(selectedNodeId), false)}
            style={{
              opacity: runFromSelectionEnabled ? 1 : 0.4,
              cursor: runFromSelectionEnabled ? 'pointer' : 'not-allowed'
            }}
          >
            <span className="codicon codicon-run-above" style={{ marginRight: '10px', opacity: 0.7 }}></span>
            Run From Selection
          </button>
          <button
            type="button"
            role="menuitem"
            className="nodrag run-menu-item"
            disabled={!runFromSelectionEnabled}
            onClick={() => runFromSelectionEnabled && runPipelineFromHere(String(selectedNodeId), true)}
            style={{
              opacity: runFromSelectionEnabled ? 1 : 0.4,
              cursor: runFromSelectionEnabled ? 'pointer' : 'not-allowed'
            }}
          >
            <span className="codicon codicon-debug-step-over" style={{ marginRight: '10px', opacity: 0.7 }}></span>
            Dry Run From Selection
          </button>
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.05)', margin: '4px 8px' }} />
          <button
            type="button"
            role="menuitem"
            className="nodrag run-menu-item"
            onClick={() => {
              setRunPreviewIds(null);
              setRunMenuOpen(false);
            }}
            style={{ color: 'rgba(255, 255, 255, 0.5)' }}
          >
            <span className="codicon codicon-clear-all" style={{ marginRight: '10px', opacity: 0.7 }}></span>
            Clear Highlights
          </button>

          <style>{`
            .run-menu-item {
              width: 100%;
              text-align: left;
              background: transparent;
              border: none;
              padding: 10px 12px;
              cursor: pointer;
              color: #fff;
              font-size: 12px;
              font-weight: 500;
              border-radius: 8px;
              display: flex;
              align-items: center;
              transition: background 0.2s ease;
            }
            .run-menu-item:hover:not(:disabled) {
              background: rgba(255, 255, 255, 0.1);
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default React.memo(RunControlBar);

import { useState } from 'react';
import { RunStepLog, RunTimelineEntry } from '../types/messages';

type RunTimelineProps = {
  steps: RunStepLog[];
  timeline?: RunTimelineEntry[];
};

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }: { status: RunStepLog['status'] }) {
  if (status === 'success') {
    return <span className="codicon codicon-check" style={{ color: 'var(--ir-status-success)', fontSize: '12px' }} />;
  }
  if (status === 'failure') {
    return <span className="codicon codicon-error" style={{ color: 'var(--ir-status-error)', fontSize: '12px' }} />;
  }
  if (status === 'running') {
    return <span className="codicon codicon-loading codicon-modifier-spin" style={{ color: 'var(--ir-accent-primary)', fontSize: '12px' }} />;
  }
  return <span className="codicon codicon-circle-outline" style={{ opacity: 0.4, fontSize: '12px' }} />;
}

function StepRow({ step, logs }: { step: RunStepLog; logs: RunTimelineEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const stepLogs = logs.filter(e => e.stepId === step.stepId || e.intentId === step.intentId).filter(e => e.type === 'step.log');
  const hasLogs = stepLogs.length > 0;

  return (
    <div style={{ marginBottom: '2px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '6px',
          background: step.status === 'failure' ? 'rgba(220,50,50,0.06)' : 'rgba(255,255,255,0.02)',
          cursor: hasLogs ? 'pointer' : 'default',
          transition: 'background 0.15s ease'
        }}
        onClick={() => hasLogs && setExpanded(v => !v)}
      >
        <StatusIcon status={step.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {step.description || step.intent || step.stepId || step.intentId}
          </span>
          {step.intent && step.description && (
            <span style={{ fontSize: '10px', opacity: 0.4, fontFamily: 'monospace' }}>{step.intent}</span>
          )}
        </div>
        {step.durationMs !== undefined && (
          <span style={{ fontSize: '10px', fontFamily: 'monospace', opacity: 0.45, flexShrink: 0, marginLeft: 'auto' }}>
            {formatDuration(step.durationMs)}
          </span>
        )}
        {hasLogs && (
          <span className={`codicon codicon-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: '10px', opacity: 0.4, flexShrink: 0 }} />
        )}
      </div>

      {expanded && hasLogs && (
        <div style={{
          margin: '2px 0 4px 28px',
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '4px',
          borderLeft: '2px solid rgba(255,255,255,0.08)',
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.6)',
          lineHeight: '1.5',
          maxHeight: '120px',
          overflowY: 'auto'
        }}>
          {stepLogs.map((log, i) => (
            <div key={i} style={{ color: log.level === 'error' ? 'var(--ir-status-error)' : log.level === 'warn' ? '#e6c300' : 'rgba(255,255,255,0.6)' }}>
              {log.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RunTimeline({ steps, timeline = [] }: RunTimelineProps) {
  if (!steps || steps.length === 0) {
    return (
      <div style={{ opacity: 0.4, fontSize: '11px', padding: '12px 8px', textAlign: 'center' }}>
        No steps recorded.
      </div>
    );
  }

  const totalDuration = steps.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
  const failedCount = steps.filter(s => s.status === 'failure').length;

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.5 }}>
          Timeline ({steps.length} step{steps.length !== 1 ? 's' : ''})
        </span>
        <div style={{ display: 'flex', gap: '8px', fontSize: '10px', fontFamily: 'monospace' }}>
          {failedCount > 0 && (
            <span style={{ color: 'var(--ir-status-error)' }}>{failedCount} failed</span>
          )}
          {totalDuration > 0 && (
            <span style={{ opacity: 0.4 }}>{formatDuration(totalDuration)} total</span>
          )}
        </div>
      </div>

      {steps.map((step) => (
        <StepRow
          key={step.intentId}
          step={step}
          logs={timeline}
        />
      ))}
    </div>
  );
}

export default RunTimeline;

import React from 'react';

type FlowToastsProps = {
  connectionError: string | null;
  graphToast: string | null;
};

export default function FlowToasts(props: FlowToastsProps) {
  const { connectionError, graphToast } = props;

  return (
    <>
      {connectionError && (
        <div
          className="nodrag"
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1300,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--vscode-errorForeground)',
            background: 'var(--vscode-editorWidget-background)',
            color: 'var(--vscode-errorForeground)',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)'
          }}
        >
          {connectionError}
        </div>
      )}

      {graphToast && (
        <div
          className="nodrag"
          style={{
            position: 'absolute',
            bottom: '68px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 995,
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-editorWidget-border)',
            borderRadius: '999px',
            padding: '6px 12px',
            fontSize: '11px',
            color: 'var(--vscode-foreground)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.32)'
          }}
        >
          {graphToast}
        </div>
      )}
    </>
  );
}

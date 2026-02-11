import React from 'react';

type EnvVar = { key: string; value: string; visible: boolean };

type EnvironmentPanelProps = {
  envVars: EnvVar[];
  updateEnvVar: (index: number, field: 'key' | 'value', value: string) => void;
  toggleVisibility: (index: number) => void;
  removeEnvVar: (index: number) => void;
  handleBlur: () => void;
  addEnvVar: () => void;
};

export default function EnvironmentPanel({
  envVars,
  updateEnvVar,
  toggleVisibility,
  removeEnvVar,
  handleBlur,
  addEnvVar
}: EnvironmentPanelProps) {
  return (
    <div style={{ padding: '0 8px' }}>
      <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
        Workspace Environment Variables (injected into terminal &amp; variables)
      </div>
      {envVars.map((v, i) => (
        <div key={i} style={{ marginBottom: '8px', border: '1px solid var(--vscode-widget-border)', padding: '8px', borderRadius: '4px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <input
              type="text"
              placeholder="Key"
              aria-label="Environment variable key"
              value={v.key}
              onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
              onBlur={handleBlur}
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '4px',
                fontSize: '11px'
              }}
            />
            <button
              onClick={() => removeEnvVar(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
              title="Delete"
              aria-label="Delete environment variable"
            >
              <span className="codicon codicon-trash"></span>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type={v.visible ? 'text' : 'password'}
              placeholder="Value"
              aria-label="Environment variable value"
              value={v.value}
              onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
              onBlur={handleBlur}
              style={{
                flex: 1,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '4px',
                fontSize: '11px'
              }}
            />
            <button
              onClick={() => toggleVisibility(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-foreground)' }}
              title={v.visible ? 'Hide' : 'Show'}
              aria-label={v.visible ? 'Hide value' : 'Show value'}
            >
              <span className={`codicon ${v.visible ? 'codicon-eye-closed' : 'codicon-eye'}`}></span>
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={addEnvVar}
        style={{
          width: '100%',
          padding: '6px',
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '11px'
        }}
      >
        + Add Variable
      </button>
    </div>
  );
}

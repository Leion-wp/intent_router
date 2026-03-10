import React from 'react';
import { formatUiError } from '../utils/uiMessageUtils';

type WebviewErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

type WebviewErrorBoundaryProps = {
  children: React.ReactNode;
};

export default class WebviewErrorBoundary extends React.Component<WebviewErrorBoundaryProps, WebviewErrorBoundaryState> {
  state: WebviewErrorBoundaryState = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: unknown): WebviewErrorBoundaryState {
    return {
      hasError: true,
      message: formatUiError(error, {
        context: 'Builder runtime',
        action: 'Reload the webview to recover.'
      })
    };
  }

  componentDidCatch(error: unknown) {
    try {
      console.error('[IntentRouter] webview crash', error);
    } catch {
      // ignore logging errors
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-foreground)',
          fontFamily: 'var(--vscode-font-family)',
          padding: '20px',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            maxWidth: '620px',
            border: '1px solid var(--vscode-editorWidget-border)',
            borderRadius: '8px',
            background: 'var(--vscode-editorWidget-background)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700 }}>Pipeline Builder encountered a runtime error.</div>
          <div style={{ fontSize: '12px', color: 'var(--vscode-errorForeground)' }}>{this.state.message}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 10px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)'
              }}
            >
              Reload webview
            </button>
          </div>
        </div>
      </div>
    );
  }
}

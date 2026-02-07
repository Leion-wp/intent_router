export type ThemeTokens = {
  runButton: { idle: string; running: string; success: string; error: string; foreground: string };
  addButton: { background: string; foreground: string; border: string };
  node: { background: string; border: string; text: string };
  status: { running: string; success: string; error: string };
  edges: { idle: string; running: string; success: string; error: string };
  minimap: { background: string; node: string; mask: string; viewportBorder: string };
  controls: { background: string; buttonBackground: string; buttonForeground: string; buttonHoverBackground: string; buttonHoverForeground: string };
};

export type UiPreset = {
  version: number;
  theme: { tokens: ThemeTokens };
};

export const defaultThemeTokens: ThemeTokens = {
  runButton: { idle: '#0e639c', running: '#007acc', success: '#4caf50', error: '#f44336', foreground: '#ffffff' },
  addButton: { background: '#0e639c', foreground: '#ffffff', border: '#3c3c3c' },
  node: { background: '#1e1e1e', border: '#3c3c3c', text: '#cccccc' },
  status: { running: '#f2c94c', success: '#4caf50', error: '#f44336' },
  edges: { idle: '#8a8a8a', running: '#007acc', success: '#4caf50', error: '#f44336' },
  minimap: { background: '#1e1e1e', node: '#cccccc', mask: 'rgba(0,0,0,0.35)', viewportBorder: '#3c3c3c' },
  controls: {
    background: '#1e1e1e',
    buttonBackground: '#3a3d41',
    buttonForeground: '#ffffff',
    buttonHoverBackground: '#094771',
    buttonHoverForeground: '#ffffff'
  }
};

export function normalizeThemeTokens(raw: any): ThemeTokens {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  return {
    runButton: { ...defaultThemeTokens.runButton, ...(incoming.runButton || {}) },
    addButton: { ...defaultThemeTokens.addButton, ...(incoming.addButton || {}) },
    node: { ...defaultThemeTokens.node, ...(incoming.node || {}) },
    status: { ...defaultThemeTokens.status, ...(incoming.status || {}) },
    edges: { ...defaultThemeTokens.edges, ...(incoming.edges || {}) },
    minimap: { ...defaultThemeTokens.minimap, ...(incoming.minimap || {}) },
    controls: { ...defaultThemeTokens.controls, ...(incoming.controls || {}) }
  };
}

export function tokensFromPreset(preset: any): ThemeTokens {
  return normalizeThemeTokens(preset?.theme?.tokens || preset?.tokens || {});
}

export function applyThemeTokensToRoot(tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.style.setProperty('--ir-run-idle', tokens.runButton.idle);
  root.style.setProperty('--ir-run-running', tokens.runButton.running);
  root.style.setProperty('--ir-run-success', tokens.runButton.success);
  root.style.setProperty('--ir-run-error', tokens.runButton.error);
  root.style.setProperty('--ir-run-foreground', tokens.runButton.foreground);

  root.style.setProperty('--ir-add-bg', tokens.addButton.background);
  root.style.setProperty('--ir-add-fg', tokens.addButton.foreground);
  root.style.setProperty('--ir-add-border', tokens.addButton.border);

  root.style.setProperty('--ir-node-bg', tokens.node.background);
  root.style.setProperty('--ir-node-border', tokens.node.border);
  root.style.setProperty('--ir-node-text', tokens.node.text);

  root.style.setProperty('--ir-status-running', tokens.status.running);
  root.style.setProperty('--ir-status-success', tokens.status.success);
  root.style.setProperty('--ir-status-error', tokens.status.error);

  root.style.setProperty('--ir-edge-idle', tokens.edges.idle);
  root.style.setProperty('--ir-edge-running', tokens.edges.running);
  root.style.setProperty('--ir-edge-success', tokens.edges.success);
  root.style.setProperty('--ir-edge-error', tokens.edges.error);

  root.style.setProperty('--ir-minimap-bg', tokens.minimap.background);
  root.style.setProperty('--ir-minimap-node', tokens.minimap.node);
  root.style.setProperty('--ir-minimap-mask', tokens.minimap.mask);
  root.style.setProperty('--ir-minimap-viewport', tokens.minimap.viewportBorder);

  root.style.setProperty('--ir-controls-bg', tokens.controls.background);
  root.style.setProperty('--ir-controls-btn-bg', tokens.controls.buttonBackground);
  root.style.setProperty('--ir-controls-btn-fg', tokens.controls.buttonForeground);
  root.style.setProperty('--ir-controls-btn-hover-bg', tokens.controls.buttonHoverBackground);
  root.style.setProperty('--ir-controls-btn-hover-fg', tokens.controls.buttonHoverForeground);
}

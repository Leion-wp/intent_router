export type ThemeTokens = {
  runButton: { idle: string; running: string; success: string; error: string; foreground: string };
  addButton: { background: string; foreground: string; border: string };
  node: { background: string; border: string; text: string };
  status: { running: string; success: string; error: string };
  edges: { idle: string; running: string; success: string; error: string };
  minimap: { background: string; node: string; mask: string; viewportBorder: string };
  controls: { background: string; buttonBackground: string; buttonForeground: string; buttonHoverBackground: string; buttonHoverForeground: string };
};

export type SidebarTabType = 'pipelines' | 'history' | 'settings' | 'catalog' | 'importExport' | 'studio';

export type SidebarTabPreset = {
  id: string;
  title: string;
  icon: string;
  type: SidebarTabType;
  visible: boolean;
};

export type PaletteCategoryId = 'context' | 'providers' | 'custom';

export type PaletteCategoryPreset = {
  id: PaletteCategoryId;
  title: string;
  visible: boolean;
  order: number;
};

export type PalettePreset = {
  categories: PaletteCategoryPreset[];
  pinned: string[];
};

export type UiPreset = {
  version: number;
  theme: { tokens: ThemeTokens };
  sidebar: { tabs: SidebarTabPreset[] };
  palette: PalettePreset;
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

export const defaultSidebarTabs: SidebarTabPreset[] = [
  { id: 'nodes', title: 'NODES', icon: 'codicon-symbol-misc', type: 'pipelines', visible: true },
  { id: 'history', title: 'HISTORY', icon: 'codicon-history', type: 'history', visible: true },
  { id: 'env', title: 'ENV', icon: 'codicon-symbol-constant', type: 'settings', visible: true },
  { id: 'studio', title: 'STUDIO', icon: 'codicon-tools', type: 'studio', visible: true }
];

export const defaultPalette: PalettePreset = {
  categories: [
    { id: 'context', title: 'Context', visible: true, order: 0 },
    { id: 'providers', title: 'Providers', visible: true, order: 1 },
    { id: 'custom', title: 'Custom', visible: true, order: 2 }
  ],
  pinned: ['preset-terminal', 'preset-form', 'preset-switch']
};

const validTabTypes: SidebarTabType[] = ['pipelines', 'history', 'settings', 'catalog', 'importExport', 'studio'];
const validCategoryIds: PaletteCategoryId[] = ['context', 'providers', 'custom'];

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

export function normalizeSidebarTabs(raw: any): SidebarTabPreset[] {
  const incoming = Array.isArray(raw) ? raw : [];
  const output: SidebarTabPreset[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const tab = incoming[i];
    const typeCandidate = String(tab?.type || '').trim() as SidebarTabType;
    const type = validTabTypes.includes(typeCandidate) ? typeCandidate : 'pipelines';
    const fallbackId = `tab-${i + 1}`;
    const id = String(tab?.id || fallbackId).trim() || fallbackId;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push({
      id,
      title: String(tab?.title || id).trim() || id,
      icon: String(tab?.icon || 'codicon-symbol-misc').trim() || 'codicon-symbol-misc',
      type,
      visible: tab?.visible !== false
    });
  }

  if (output.length === 0) {
    return defaultSidebarTabs.map(tab => ({ ...tab }));
  }
  if (!output.some(tab => tab.visible)) {
    output[0].visible = true;
  }
  return output;
}

export function normalizePalette(raw: any): PalettePreset {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const incomingCategories = Array.isArray(incoming.categories) ? incoming.categories : [];
  const byId = new Map<string, any>();
  for (const category of incomingCategories) {
    const id = String(category?.id || '').trim();
    if (!id) continue;
    byId.set(id, category);
  }

  const categories = validCategoryIds.map((id, index) => {
    const base = defaultPalette.categories.find(category => category.id === id)!;
    const custom = byId.get(id) || {};
    const orderNumber = Number(custom.order);
    return {
      id,
      title: String(custom.title || base.title).trim() || base.title,
      visible: custom.visible !== false,
      order: Number.isFinite(orderNumber) ? orderNumber : (base.order ?? index)
    };
  }).sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

  const pinnedRaw = Array.isArray(incoming.pinned) ? incoming.pinned : defaultPalette.pinned;
  const pinned: string[] = [];
  const seenPinned = new Set<string>();
  for (const value of pinnedRaw) {
    const id = String(value || '').trim();
    if (!id || seenPinned.has(id)) continue;
    seenPinned.add(id);
    pinned.push(id);
  }

  return { categories, pinned };
}

export function normalizeUiPreset(raw: any): UiPreset {
  return {
    version: Number(raw?.version || 1),
    theme: { tokens: normalizeThemeTokens(raw?.theme?.tokens || raw?.tokens || {}) },
    sidebar: { tabs: normalizeSidebarTabs(raw?.sidebar?.tabs) },
    palette: normalizePalette(raw?.palette)
  };
}

export function tokensFromPreset(preset: any): ThemeTokens {
  return normalizeUiPreset(preset).theme.tokens;
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

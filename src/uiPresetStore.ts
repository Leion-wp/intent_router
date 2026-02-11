import * as vscode from 'vscode';

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

const DEFAULT_PRESET: UiPreset = {
    version: 1,
    theme: {
        tokens: {
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
        }
    },
    sidebar: {
        tabs: [
            { id: 'nodes', title: 'NODES', icon: 'codicon-symbol-misc', type: 'pipelines', visible: true },
            { id: 'history', title: 'HISTORY', icon: 'codicon-history', type: 'history', visible: true },
            { id: 'env', title: 'ENV', icon: 'codicon-symbol-constant', type: 'settings', visible: true },
            { id: 'studio', title: 'STUDIO', icon: 'codicon-tools', type: 'studio', visible: true }
        ]
    },
    palette: {
        categories: [
            { id: 'context', title: 'Context', visible: true, order: 0 },
            { id: 'providers', title: 'Providers', visible: true, order: 1 },
            { id: 'custom', title: 'Custom', visible: true, order: 2 }
        ],
        pinned: ['preset-terminal', 'preset-form', 'preset-switch']
    }
};

const VALID_TAB_TYPES: SidebarTabType[] = ['pipelines', 'history', 'settings', 'catalog', 'importExport', 'studio'];
const VALID_PALETTE_CATEGORY_IDS: PaletteCategoryId[] = ['context', 'providers', 'custom'];

function getWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export function getUiDraftUri(): vscode.Uri | undefined {
    const root = getWorkspaceRoot();
    if (!root) return undefined;
    return vscode.Uri.joinPath(root, 'leion-roots.ui.draft.json');
}

export function getEmbeddedUiPresetUri(extensionUri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(extensionUri, 'media', 'ui-preset.default.json');
}

function coerceThemeTokens(raw: any): ThemeTokens {
    const incoming = raw && typeof raw === 'object' ? raw : {};
    const defaults = DEFAULT_PRESET.theme.tokens;
    return {
        runButton: { ...defaults.runButton, ...(incoming.runButton || {}) },
        addButton: { ...defaults.addButton, ...(incoming.addButton || {}) },
        node: { ...defaults.node, ...(incoming.node || {}) },
        status: { ...defaults.status, ...(incoming.status || {}) },
        edges: { ...defaults.edges, ...(incoming.edges || {}) },
        minimap: { ...defaults.minimap, ...(incoming.minimap || {}) },
        controls: { ...defaults.controls, ...(incoming.controls || {}) }
    };
}

function coerceSidebarTabs(raw: any): SidebarTabPreset[] {
    const incoming = Array.isArray(raw) ? raw : [];
    const defaults = DEFAULT_PRESET.sidebar.tabs;
    const out: SidebarTabPreset[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < incoming.length; i++) {
        const tab = incoming[i];
        const incomingType = String(tab?.type || '').trim() as SidebarTabType;
        const type = VALID_TAB_TYPES.includes(incomingType) ? incomingType : 'pipelines';
        const fallbackId = `tab-${i + 1}`;
        const id = String(tab?.id || fallbackId).trim() || fallbackId;
        if (seen.has(id)) continue;
        seen.add(id);
        const title = String(tab?.title || id).trim() || id;
        const icon = String(tab?.icon || 'codicon-symbol-misc').trim() || 'codicon-symbol-misc';
        out.push({
            id,
            title,
            icon,
            type,
            visible: tab?.visible !== false
        });
    }

    if (out.length === 0) {
        return defaults.map(tab => ({ ...tab }));
    }

    if (!out.some(tab => tab.visible)) {
        out[0].visible = true;
    }

    return out;
}

function coercePalette(raw: any): PalettePreset {
    const defaults = DEFAULT_PRESET.palette;
    const incoming = raw && typeof raw === 'object' ? raw : {};
    const incomingCategories = Array.isArray(incoming.categories) ? incoming.categories : [];
    const byId = new Map<string, any>();
    for (const category of incomingCategories) {
        const id = String(category?.id || '').trim();
        if (!id) continue;
        byId.set(id, category);
    }

    const categories: PaletteCategoryPreset[] = VALID_PALETTE_CATEGORY_IDS.map((id, index) => {
        const base = defaults.categories.find(c => c.id === id)!;
        const custom = byId.get(id) || {};
        const orderNumber = Number(custom.order);
        return {
            id,
            title: String(custom.title || base.title).trim() || base.title,
            visible: custom.visible !== false,
            order: Number.isFinite(orderNumber) ? orderNumber : base.order ?? index
        };
    }).sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

    const pinnedRaw = Array.isArray(incoming.pinned) ? incoming.pinned : defaults.pinned;
    const pinned: string[] = [];
    const seenPinned = new Set<string>();
    for (const item of pinnedRaw) {
        const id = String(item || '').trim();
        if (!id || seenPinned.has(id)) continue;
        seenPinned.add(id);
        pinned.push(id);
    }

    return { categories, pinned };
}

function coercePreset(raw: any): UiPreset {
    const version = Number(raw?.version || 1);
    return {
        version,
        theme: {
            tokens: coerceThemeTokens(raw?.theme?.tokens)
        },
        sidebar: {
            tabs: coerceSidebarTabs(raw?.sidebar?.tabs)
        },
        palette: coercePalette(raw?.palette)
    };
}

export async function readEmbeddedUiPreset(extensionUri: vscode.Uri): Promise<UiPreset> {
    try {
        const uri = getEmbeddedUiPresetUri(extensionUri);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return coercePreset(JSON.parse(text));
    } catch {
        return DEFAULT_PRESET;
    }
}

export async function readUiDraftFromWorkspace(): Promise<UiPreset | undefined> {
    const uri = getUiDraftUri();
    if (!uri) return undefined;
    if (!(await fileExists(uri))) return undefined;
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return coercePreset(JSON.parse(text));
    } catch {
        return undefined;
    }
}

export async function writeUiDraftToWorkspace(preset: UiPreset): Promise<void> {
    const uri = getUiDraftUri();
    if (!uri) {
        throw new Error('No workspace folder open.');
    }
    const text = JSON.stringify(coercePreset(preset), null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}

export async function deleteUiDraftFromWorkspace(): Promise<void> {
    const uri = getUiDraftUri();
    if (!uri) return;
    if (!(await fileExists(uri))) return;
    await vscode.workspace.fs.delete(uri);
}

export async function resolveUiPreset(extensionUri: vscode.Uri, adminMode: boolean): Promise<UiPreset> {
    const releasePreset = await readEmbeddedUiPreset(extensionUri);
    if (!adminMode) {
        return releasePreset;
    }

    const draft = await readUiDraftFromWorkspace();
    if (!draft) {
        return releasePreset;
    }

    return {
        version: draft.version || releasePreset.version,
        theme: {
            tokens: coerceThemeTokens(draft.theme?.tokens || releasePreset.theme?.tokens)
        },
        sidebar: {
            tabs: coerceSidebarTabs(draft.sidebar?.tabs || releasePreset.sidebar?.tabs)
        },
        palette: coercePalette(draft.palette || releasePreset.palette)
    };
}

export async function writeEmbeddedUiPreset(extensionUri: vscode.Uri, preset: UiPreset): Promise<vscode.Uri> {
    const uri = getEmbeddedUiPresetUri(extensionUri);
    const text = JSON.stringify(coercePreset(preset), null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    return uri;
}

export function getDefaultUiPreset(): UiPreset {
    return DEFAULT_PRESET;
}

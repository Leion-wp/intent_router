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

export type UiPreset = {
    version: number;
    theme: { tokens: ThemeTokens };
};

const DEFAULT_PRESET: UiPreset = {
    version: 1,
    theme: {
        tokens: {
            runButton: { idle: '#0e639c', running: '#007acc', success: '#4caf50', error: '#f44336', foreground: '#ffffff' },
            addButton: { background: '#0e639c', foreground: '#ffffff', border: '#3c3c3c' },
            node: { background: '#1e1e1e', border: '#3c3c3c', text: '#cccccc' },
            status: { running: '#007acc', success: '#4caf50', error: '#f44336' },
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
    }
};

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

function coercePreset(raw: any): UiPreset {
    const version = Number(raw?.version || 1);
    return {
        version,
        theme: {
            tokens: coerceThemeTokens(raw?.theme?.tokens)
        }
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
            tokens: coerceThemeTokens(draft.theme?.tokens)
        }
    };
}

export function getDefaultUiPreset(): UiPreset {
    return DEFAULT_PRESET;
}

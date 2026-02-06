import * as vscode from 'vscode';

export type CustomNodeSchemaField = {
    name: string;
    type: 'string' | 'boolean' | 'enum' | 'path';
    description?: string;
    options?: string[] | string;
    required?: boolean;
    default?: any;
};

export type CustomNodeDefinition = {
    id: string;
    title: string;
    intent: string;
    schema?: CustomNodeSchemaField[];
    mapping?: Record<string, any>;
};

type CustomNodesFile = {
    version: 1;
    nodes: CustomNodeDefinition[];
};

const FILE_VERSION = 1 as const;

function getWorkspaceRoot(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.uri;
}

export function getCustomNodesUri(): vscode.Uri | undefined {
    const root = getWorkspaceRoot();
    if (!root) return undefined;
    return vscode.Uri.joinPath(root, '.intent-router', 'nodes.json');
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

async function ensureParentFolder(uri: vscode.Uri): Promise<void> {
    const parent = vscode.Uri.joinPath(uri, '..');
    await vscode.workspace.fs.createDirectory(parent);
}

function coerceNodesFile(raw: any): CustomNodesFile {
    if (!raw || typeof raw !== 'object') {
        return { version: FILE_VERSION, nodes: [] };
    }
    const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    return { version: FILE_VERSION, nodes };
}

export async function readCustomNodesFromWorkspace(): Promise<CustomNodeDefinition[]> {
    const uri = getCustomNodesUri();
    if (!uri) return [];
    const exists = await fileExists(uri);
    if (!exists) return [];

    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        const parsed = JSON.parse(text);
        const file = coerceNodesFile(parsed);
        return sanitizeCustomNodes(file.nodes);
    } catch (e) {
        console.warn('[Intent Router] Failed to read custom nodes:', e);
        return [];
    }
}

export async function writeCustomNodesToWorkspace(nodes: CustomNodeDefinition[]): Promise<void> {
    const uri = getCustomNodesUri();
    if (!uri) {
        throw new Error('No workspace folder open.');
    }
    await ensureParentFolder(uri);
    const file: CustomNodesFile = { version: FILE_VERSION, nodes: sanitizeCustomNodes(nodes) };
    const text = JSON.stringify(file, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}

export async function upsertCustomNodeInWorkspace(node: CustomNodeDefinition): Promise<CustomNodeDefinition[]> {
    const normalized = normalizeCustomNode(node);
    const nodes = await readCustomNodesFromWorkspace();
    const next = nodes.filter(n => n.id !== normalized.id);
    next.push(normalized);
    next.sort((a, b) => a.title.localeCompare(b.title));
    await writeCustomNodesToWorkspace(next);
    return next;
}

export async function deleteCustomNodeInWorkspace(id: string): Promise<CustomNodeDefinition[]> {
    const nodes = await readCustomNodesFromWorkspace();
    const next = nodes.filter(n => n.id !== id);
    await writeCustomNodesToWorkspace(next);
    return next;
}

export function exportCustomNodes(nodes: CustomNodeDefinition[] | CustomNodeDefinition): string {
    const list = Array.isArray(nodes) ? nodes : [nodes];
    const file: CustomNodesFile = { version: FILE_VERSION, nodes: sanitizeCustomNodes(list) };
    return JSON.stringify(file, null, 2);
}

export function importCustomNodesJson(existing: CustomNodeDefinition[], jsonText: string): {
    merged: CustomNodeDefinition[];
    imported: CustomNodeDefinition[];
    renames: Record<string, string>;
} {
    const parsed = JSON.parse(String(jsonText || ''));
    const file = coerceNodesFile(parsed);
    const incoming = sanitizeCustomNodes(file.nodes);

    const byId = new Map(existing.map(n => [n.id, n]));
    const renames: Record<string, string> = {};
    const imported: CustomNodeDefinition[] = [];

    for (const node of incoming) {
        const desired = node.id;
        const finalId = byId.has(desired) ? generateUniqueId(desired, byId) : desired;
        if (finalId !== desired) {
            renames[desired] = finalId;
        }
        const normalized = { ...node, id: finalId };
        byId.set(finalId, normalized);
        imported.push(normalized);
    }

    const merged = sanitizeCustomNodes(Array.from(byId.values()));
    return { merged, imported, renames };
}

function sanitizeCustomNodes(nodes: CustomNodeDefinition[]): CustomNodeDefinition[] {
    const out: CustomNodeDefinition[] = [];
    const seen = new Set<string>();
    for (const n of nodes || []) {
        try {
            const normalized = normalizeCustomNode(n);
            if (seen.has(normalized.id)) continue;
            seen.add(normalized.id);
            out.push(normalized);
        } catch {
            // ignore bad entries
        }
    }
    out.sort((a, b) => a.title.localeCompare(b.title));
    return out;
}

function generateUniqueId(base: string, existing: Map<string, any>): string {
    const cleanBase = String(base || '').trim() || 'custom';
    if (!existing.has(cleanBase)) return cleanBase;
    let i = 2;
    while (existing.has(`${cleanBase}-${i}`)) {
        i += 1;
        if (i > 10_000) {
            // extremely unlikely, but avoid infinite loop
            return `${cleanBase}-${Date.now()}`;
        }
    }
    return `${cleanBase}-${i}`;
}

function normalizeCustomNode(node: any): CustomNodeDefinition {
    const id = String(node?.id || '').trim();
    const title = String(node?.title || '').trim();
    const intent = String(node?.intent || '').trim();
    if (!id) throw new Error('Custom node "id" is required.');
    if (!title) throw new Error('Custom node "title" is required.');
    if (!intent) throw new Error('Custom node "intent" is required.');

    const schema = Array.isArray(node?.schema) ? node.schema : [];
    const mapping = node?.mapping && typeof node.mapping === 'object' ? node.mapping : undefined;

    return {
        id,
        title,
        intent,
        schema: schema.map(normalizeSchemaField).filter(Boolean) as CustomNodeSchemaField[],
        mapping
    };
}

function normalizeSchemaField(field: any): CustomNodeSchemaField | undefined {
    const name = String(field?.name || '').trim();
    if (!name) return undefined;
    const type = String(field?.type || 'string') as CustomNodeSchemaField['type'];
    const allowed: CustomNodeSchemaField['type'][] = ['string', 'boolean', 'enum', 'path'];
    const finalType: CustomNodeSchemaField['type'] = allowed.includes(type) ? type : 'string';

    const out: CustomNodeSchemaField = {
        name,
        type: finalType
    };
    if (typeof field?.description === 'string') out.description = field.description;
    if (typeof field?.required === 'boolean') out.required = field.required;
    if (field?.default !== undefined) out.default = field.default;
    if (field?.options !== undefined) out.options = field.options;
    return out;
}

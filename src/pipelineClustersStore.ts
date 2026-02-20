import * as vscode from 'vscode';

export const PIPELINE_CLUSTERS_FILE_NAME = '.intent-router.clusters.json';

export type PipelineSortMode = 'updated' | 'manual';

export type PipelineClusterEntry = {
    id: string;
    name: string;
    pipelinePaths: string[];
};

export type PipelineClustersState = {
    version: 1;
    sortMode: PipelineSortMode;
    clusterOrder: string[];
    manualUnclusteredOrder: string[];
    clusters: Record<string, PipelineClusterEntry>;
};

export function createDefaultPipelineClustersState(): PipelineClustersState {
    return {
        version: 1,
        sortMode: 'updated',
        clusterOrder: [],
        manualUnclusteredOrder: [],
        clusters: {}
    };
}

export function getPipelineRootUri(): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    return vscode.Uri.joinPath(workspaceFolder.uri, 'pipeline');
}

export function getPipelineClustersFileUri(): vscode.Uri | undefined {
    const pipelineRoot = getPipelineRootUri();
    if (!pipelineRoot) {
        return undefined;
    }
    return vscode.Uri.joinPath(pipelineRoot, PIPELINE_CLUSTERS_FILE_NAME);
}

export async function loadPipelineClustersState(): Promise<PipelineClustersState> {
    const uri = getPipelineClustersFileUri();
    if (!uri) {
        return createDefaultPipelineClustersState();
    }

    try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
        return sanitizePipelineClustersState(parsed);
    } catch {
        return createDefaultPipelineClustersState();
    }
}

export async function savePipelineClustersState(state: PipelineClustersState): Promise<void> {
    const pipelineRoot = getPipelineRootUri();
    const uri = getPipelineClustersFileUri();
    if (!pipelineRoot || !uri) {
        return;
    }

    await vscode.workspace.fs.createDirectory(pipelineRoot);
    const content = JSON.stringify(sanitizePipelineClustersState(state), null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

export function sanitizePipelineRelativePath(pathLike: string): string {
    const normalized = String(pathLike || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!normalized.endsWith('.intent.json')) {
        return normalized;
    }
    return normalized;
}

function sanitizePipelineClustersState(value: unknown): PipelineClustersState {
    const fallback = createDefaultPipelineClustersState();
    if (!value || typeof value !== 'object') {
        return fallback;
    }
    const source = value as Record<string, unknown>;
    const sortMode = source.sortMode === 'manual' ? 'manual' : 'updated';

    const rawClusters = source.clusters && typeof source.clusters === 'object'
        ? source.clusters as Record<string, unknown>
        : {};

    const clusters: Record<string, PipelineClusterEntry> = {};
    for (const [id, entry] of Object.entries(rawClusters)) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const obj = entry as Record<string, unknown>;
        const clusterId = String(obj.id || id).trim();
        const clusterName = String(obj.name || clusterId).trim();
        if (!clusterId || !clusterName) {
            continue;
        }
        const pipelinePaths = Array.isArray(obj.pipelinePaths)
            ? obj.pipelinePaths.map((item) => sanitizePipelineRelativePath(String(item || ''))).filter(Boolean)
            : [];
        clusters[clusterId] = {
            id: clusterId,
            name: clusterName,
            pipelinePaths: dedupeStrings(pipelinePaths)
        };
    }

    const clusterOrder = Array.isArray(source.clusterOrder)
        ? dedupeStrings(source.clusterOrder.map((item) => String(item || '').trim()).filter((id) => !!clusters[id]))
        : [];
    for (const id of Object.keys(clusters)) {
        if (!clusterOrder.includes(id)) {
            clusterOrder.push(id);
        }
    }

    const manualUnclusteredOrder = Array.isArray(source.manualUnclusteredOrder)
        ? dedupeStrings(source.manualUnclusteredOrder.map((item) => sanitizePipelineRelativePath(String(item || ''))).filter(Boolean))
        : [];

    return {
        version: 1,
        sortMode,
        clusterOrder,
        manualUnclusteredOrder,
        clusters
    };
}

function dedupeStrings(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
        if (seen.has(item)) {
            continue;
        }
        seen.add(item);
        out.push(item);
    }
    return out;
}

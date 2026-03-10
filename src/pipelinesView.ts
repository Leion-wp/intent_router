import * as vscode from 'vscode';
import { readPipelineFromUri } from './pipelineRunner';
import {
    PipelineClusterEntry,
    PipelineClustersState,
    PipelineSortMode,
    getPipelineRootUri,
    loadPipelineClustersState,
    savePipelineClustersState,
    sanitizePipelineRelativePath
} from './pipelineClustersStore';

export type PipelineItem = {
    uri: vscode.Uri;
    relativePath: string;
    profile?: string;
    stepsCount?: number;
    providers?: string[];
    updatedAt: number;
};

export type ClusterTreeNode = {
    kind: 'cluster';
    id: string;
    name: string;
    isUncategorized: boolean;
};

export type PipelineTreeNode = {
    kind: 'pipeline';
    clusterId: string;
    item: PipelineItem;
};

export type PipelinesTreeNode = ClusterTreeNode | PipelineTreeNode;

const UNCATEGORIZED_CLUSTER_ID = '__uncategorized__';
const TREE_DND_MIME = 'application/vnd.code.tree.intentRouterPipelines';

export class PipelinesTreeDataProvider implements vscode.TreeDataProvider<PipelinesTreeNode>, vscode.TreeDragAndDropController<PipelinesTreeNode>, vscode.Disposable {
    private readonly emitter = new vscode.EventEmitter<void>();
    private readonly disposables: vscode.Disposable[] = [];
    private stateCache: PipelineClustersState | null = null;

    readonly dragMimeTypes = [TREE_DND_MIME];
    readonly dropMimeTypes = [TREE_DND_MIME];
    readonly onDidChangeTreeData = this.emitter.event;

    constructor() {
        const pipelineWatcher = vscode.workspace.createFileSystemWatcher('pipeline/**/*.intent.json');
        this.disposables.push(
            pipelineWatcher,
            pipelineWatcher.onDidCreate(() => this.refresh()),
            pipelineWatcher.onDidChange(() => this.refresh()),
            pipelineWatcher.onDidDelete(() => this.refresh())
        );
        const clusterFileWatcher = vscode.workspace.createFileSystemWatcher('pipeline/.intent-router.clusters.json');
        this.disposables.push(
            clusterFileWatcher,
            clusterFileWatcher.onDidCreate(() => this.invalidateStateCache()),
            clusterFileWatcher.onDidChange(() => this.invalidateStateCache()),
            clusterFileWatcher.onDidDelete(() => this.invalidateStateCache())
        );
    }

    refresh(): void {
        this.emitter.fire();
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }

    getTreeItem(element: PipelinesTreeNode): vscode.TreeItem {
        if (element.kind === 'cluster') {
            const item = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.contextValue = element.isUncategorized ? 'uncategorizedClusterItem' : 'clusterItem';
            item.iconPath = new vscode.ThemeIcon(element.isUncategorized ? 'folder-library' : 'folder');
            return item;
        }

        const item = new vscode.TreeItem(this.getLabel(element.item));
        item.resourceUri = element.item.uri;
        item.contextValue = element.clusterId === UNCATEGORIZED_CLUSTER_ID ? 'pipelineItem' : 'pipelineInClusterItem';
        item.iconPath = new vscode.ThemeIcon('list-tree');
        item.command = {
            command: 'intentRouter.pipelines.openBuilder',
            title: 'Open Pipeline Builder',
            arguments: [element.item.uri]
        };
        item.description = this.getDescription(element.item);
        item.tooltip = this.getTooltip(element.item);
        return item;
    }

    async getChildren(element?: PipelinesTreeNode): Promise<PipelinesTreeNode[]> {
        const state = await this.getState();
        const pipelineItems = await this.getPipelineItems();
        const pipelineByPath = new Map<string, PipelineItem>(pipelineItems.map((item) => [item.relativePath, item]));
        const memberships = this.getMemberships(state);

        if (element?.kind === 'cluster') {
            const pipelinePaths = this.getClusterPipelinePaths(state, pipelineItems, memberships, element.id);
            return pipelinePaths
                .map((path) => pipelineByPath.get(path))
                .filter((item): item is PipelineItem => !!item)
                .map((item) => ({ kind: 'pipeline', clusterId: element.id, item }));
        }

        const clusters: ClusterTreeNode[] = this.getClusterNodes(state, pipelineItems, memberships);
        return clusters;
    }

    async handleDrag(
        source: readonly PipelinesTreeNode[],
        dataTransfer: vscode.DataTransfer
    ): Promise<void> {
        const dragPipelines = source
            .filter((entry): entry is PipelineTreeNode => entry.kind === 'pipeline')
            .map((entry) => ({
                relativePath: entry.item.relativePath,
                sourceClusterId: entry.clusterId
            }));
        if (dragPipelines.length === 0) {
            return;
        }
        dataTransfer.set(TREE_DND_MIME, new vscode.DataTransferItem(JSON.stringify(dragPipelines)));
    }

    async handleDrop(
        target: PipelinesTreeNode | undefined,
        dataTransfer: vscode.DataTransfer
    ): Promise<void> {
        const raw = dataTransfer.get(TREE_DND_MIME);
        if (!raw) {
            return;
        }
        let payload: Array<{ relativePath: string; sourceClusterId: string }> = [];
        try {
            const value = await raw.asString();
            payload = JSON.parse(value);
        } catch {
            return;
        }
        if (!Array.isArray(payload) || payload.length === 0) {
            return;
        }

        const state = await this.getStateForMutation();
        if (target?.kind === 'cluster' && !target.isUncategorized) {
            for (const entry of payload) {
                this.addPipelinePathToCluster(state, entry.relativePath, target.id);
            }
            if (state.sortMode === 'manual') {
                this.sortClusterManualList(state, target.id);
            }
            await this.persistState(state);
            return;
        }

        if (target?.kind === 'pipeline' && target.clusterId !== UNCATEGORIZED_CLUSTER_ID) {
            const source = payload[0];
            if (state.sortMode === 'manual' && source && source.sourceClusterId === target.clusterId) {
                this.reorderPipelineInCluster(state, target.clusterId, source.relativePath, target.item.relativePath);
                await this.persistState(state);
                return;
            }
            for (const entry of payload) {
                this.addPipelinePathToCluster(state, entry.relativePath, target.clusterId);
            }
            if (state.sortMode === 'manual') {
                this.reorderPipelineInCluster(state, target.clusterId, source.relativePath, target.item.relativePath);
            }
            await this.persistState(state);
        }
    }

    async createCluster(name: string): Promise<PipelineClusterEntry | undefined> {
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            return undefined;
        }
        const state = await this.getStateForMutation();
        const id = this.createClusterId(trimmed, state);
        state.clusters[id] = {
            id,
            name: trimmed,
            pipelinePaths: []
        };
        if (!state.clusterOrder.includes(id)) {
            state.clusterOrder.push(id);
        }
        await this.persistState(state);
        return state.clusters[id];
    }

    async renameCluster(clusterId: string, name: string): Promise<boolean> {
        const state = await this.getStateForMutation();
        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return false;
        }
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            return false;
        }
        cluster.name = trimmed;
        await this.persistState(state);
        return true;
    }

    async deleteCluster(clusterId: string): Promise<boolean> {
        if (!clusterId || clusterId === UNCATEGORIZED_CLUSTER_ID) {
            return false;
        }
        const state = await this.getStateForMutation();
        if (!state.clusters[clusterId]) {
            return false;
        }
        delete state.clusters[clusterId];
        state.clusterOrder = state.clusterOrder.filter((id) => id !== clusterId);
        await this.persistState(state);
        return true;
    }

    async addPipelineUriToCluster(uri: vscode.Uri, clusterId: string): Promise<boolean> {
        const state = await this.getStateForMutation();
        if (!state.clusters[clusterId]) {
            return false;
        }
        const relativePath = this.toPipelineRelativePath(uri);
        if (!relativePath) {
            return false;
        }
        this.addPipelinePathToCluster(state, relativePath, clusterId);
        if (state.sortMode === 'manual') {
            this.sortClusterManualList(state, clusterId);
        }
        await this.persistState(state);
        return true;
    }

    async removePipelineFromCluster(relativePath: string, clusterId: string): Promise<boolean> {
        if (!clusterId || clusterId === UNCATEGORIZED_CLUSTER_ID) {
            return false;
        }
        const state = await this.getStateForMutation();
        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return false;
        }
        const normalized = sanitizePipelineRelativePath(relativePath);
        cluster.pipelinePaths = cluster.pipelinePaths.filter((entry) => entry !== normalized);
        await this.persistState(state);
        return true;
    }

    async setSortMode(mode: PipelineSortMode): Promise<void> {
        const state = await this.getStateForMutation();
        state.sortMode = mode;
        await this.persistState(state);
    }

    async getSortMode(): Promise<PipelineSortMode> {
        const state = await this.getState();
        return state.sortMode;
    }

    async listClusters(): Promise<PipelineClusterEntry[]> {
        const state = await this.getState();
        return this.getOrderedClusters(state);
    }

    async syncPipelinePathAfterRename(previousUri: vscode.Uri, nextUri: vscode.Uri): Promise<void> {
        const before = this.toPipelineRelativePath(previousUri);
        const after = this.toPipelineRelativePath(nextUri);
        if (!before || !after || before === after) {
            return;
        }
        const state = await this.getStateForMutation();
        for (const cluster of Object.values(state.clusters)) {
            cluster.pipelinePaths = cluster.pipelinePaths.map((path) => (path === before ? after : path));
        }
        state.manualUnclusteredOrder = state.manualUnclusteredOrder.map((path) => (path === before ? after : path));
        await this.persistState(state);
    }

    async removePipelineFromAllClusters(uri: vscode.Uri): Promise<void> {
        const relativePath = this.toPipelineRelativePath(uri);
        if (!relativePath) {
            return;
        }
        const state = await this.getStateForMutation();
        for (const cluster of Object.values(state.clusters)) {
            cluster.pipelinePaths = cluster.pipelinePaths.filter((path) => path !== relativePath);
        }
        state.manualUnclusteredOrder = state.manualUnclusteredOrder.filter((path) => path !== relativePath);
        await this.persistState(state);
    }

    toPipelineRelativePath(uri: vscode.Uri): string | undefined {
        const pipelineRoot = getPipelineRootUri();
        if (!pipelineRoot) {
            return undefined;
        }
        const pipelineRootPath = pipelineRoot.path.replace(/\/+$/, '');
        const uriPath = uri.path.replace(/\\/g, '/');
        if (!uriPath.startsWith(`${pipelineRootPath}/`) && uriPath !== pipelineRootPath) {
            return undefined;
        }
        const relative = uriPath.slice(pipelineRootPath.length).replace(/^\/+/, '');
        return sanitizePipelineRelativePath(relative);
    }

    private getLabel(item: PipelineItem): string {
        const parts = item.relativePath.split('/');
        const file = parts[parts.length - 1] || 'pipeline';
        return file.replace('.intent.json', '');
    }

    private getDescription(item: PipelineItem): string {
        const parts: string[] = [];
        const dirParts = item.relativePath.split('/');
        if (dirParts.length > 1) {
            parts.push(dirParts.slice(0, -1).join('/'));
        }
        if (item.profile) {
            parts.push(`[${item.profile}]`);
        }
        if (typeof item.stepsCount === 'number') {
            parts.push(`(${item.stepsCount})`);
        }
        if (item.providers && item.providers.length > 0) {
            parts.push(item.providers.join(', '));
        }
        return parts.join(' ');
    }

    private getTooltip(item: PipelineItem): string {
        const providers = item.providers?.join(', ') ?? 'n/a';
        const steps = typeof item.stepsCount === 'number' ? item.stepsCount : 'n/a';
        const profile = item.profile ?? 'none';
        return `Profile: ${profile}\nSteps: ${steps}\nProviders: ${providers}`;
    }

    private extractProviders(steps: Array<{ intent?: string; capabilities?: string[] }>): string[] {
        const counts = new Map<string, number>();
        for (const step of steps) {
            const fromIntent = typeof step.intent === 'string' ? step.intent : '';
            const cap = fromIntent || step.capabilities?.[0] || '';
            if (!cap) continue;

            const provider = cap.split('.')[0] || 'custom';
            counts.set(provider, (counts.get(provider) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([provider]) => provider);
        return sorted.slice(0, 2);
    }

    private async getPipelineItems(): Promise<PipelineItem[]> {
        const pipelineRoot = getPipelineRootUri();
        if (!pipelineRoot) {
            return [];
        }
        const files = await vscode.workspace.findFiles('pipeline/**/*.intent.json');
        const items: PipelineItem[] = [];
        for (const uri of files) {
            const relativePath = this.toPipelineRelativePath(uri);
            if (!relativePath || relativePath.startsWith('.intent-router.')) {
                continue;
            }
            const pipeline = await readPipelineFromUri(uri);
            let updatedAt = 0;
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                updatedAt = stat.mtime;
            } catch {
                // ignore stat failures and keep deterministic sort fallback
            }
            if (!pipeline) {
                items.push({ uri, relativePath, updatedAt });
                continue;
            }
            items.push({
                uri,
                relativePath,
                profile: pipeline.profile,
                stepsCount: pipeline.steps.length,
                providers: this.extractProviders(pipeline.steps),
                updatedAt
            });
        }
        return items;
    }

    private getClusterNodes(
        state: PipelineClustersState,
        pipelineItems: PipelineItem[],
        memberships: Map<string, Set<string>>
    ): ClusterTreeNode[] {
        const clusters: ClusterTreeNode[] = this.getOrderedClusters(state)
            .map((cluster) => ({
                kind: 'cluster',
                id: cluster.id,
                name: cluster.name,
                isUncategorized: false
            }));

        const hasUncategorized = pipelineItems.some((item) => {
            const clusterIds = memberships.get(item.relativePath);
            return !clusterIds || clusterIds.size === 0;
        });
        if (hasUncategorized) {
            clusters.push({
                kind: 'cluster',
                id: UNCATEGORIZED_CLUSTER_ID,
                name: 'Unclustered',
                isUncategorized: true
            });
        }
        return clusters;
    }

    private getClusterPipelinePaths(
        state: PipelineClustersState,
        pipelineItems: PipelineItem[],
        memberships: Map<string, Set<string>>,
        clusterId: string
    ): string[] {
        const pipelineByPath = new Map(pipelineItems.map((item) => [item.relativePath, item]));
        if (clusterId === UNCATEGORIZED_CLUSTER_ID) {
            const unclustered = pipelineItems
                .filter((item) => (memberships.get(item.relativePath)?.size ?? 0) === 0)
                .map((item) => item.relativePath);
            return this.sortPipelinePaths(state, unclustered, pipelineByPath, clusterId);
        }

        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return [];
        }
        const existing = cluster.pipelinePaths.filter((path) => pipelineByPath.has(path));
        return this.sortPipelinePaths(state, existing, pipelineByPath, clusterId);
    }

    private sortPipelinePaths(
        state: PipelineClustersState,
        paths: string[],
        pipelineByPath: Map<string, PipelineItem>,
        clusterId: string
    ): string[] {
        if (state.sortMode === 'manual') {
            const manualOrder = clusterId === UNCATEGORIZED_CLUSTER_ID
                ? state.manualUnclusteredOrder
                : (state.clusters[clusterId]?.pipelinePaths || []);
            const rank = new Map<string, number>();
            manualOrder.forEach((path, index) => rank.set(path, index));
            return [...paths].sort((a, b) => {
                const rankA = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
                const rankB = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
                if (rankA !== rankB) {
                    return rankA - rankB;
                }
                return a.localeCompare(b);
            });
        }

        return [...paths].sort((a, b) => {
            const itemA = pipelineByPath.get(a);
            const itemB = pipelineByPath.get(b);
            const mtimeDiff = (itemB?.updatedAt || 0) - (itemA?.updatedAt || 0);
            if (mtimeDiff !== 0) {
                return mtimeDiff;
            }
            return a.localeCompare(b);
        });
    }

    private getMemberships(state: PipelineClustersState): Map<string, Set<string>> {
        const memberships = new Map<string, Set<string>>();
        for (const [clusterId, cluster] of Object.entries(state.clusters)) {
            for (const pipelinePath of cluster.pipelinePaths) {
                const set = memberships.get(pipelinePath) ?? new Set<string>();
                set.add(clusterId);
                memberships.set(pipelinePath, set);
            }
        }
        return memberships;
    }

    private getOrderedClusters(state: PipelineClustersState): PipelineClusterEntry[] {
        const clusters = Object.values(state.clusters);
        const rank = new Map<string, number>();
        state.clusterOrder.forEach((id, index) => rank.set(id, index));
        return clusters.sort((a, b) => {
            const rankA = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rankB = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return a.name.localeCompare(b.name);
        });
    }

    private async getState(): Promise<PipelineClustersState> {
        if (this.stateCache) {
            return this.stateCache;
        }
        this.stateCache = await loadPipelineClustersState();
        return this.stateCache;
    }

    private async getStateForMutation(): Promise<PipelineClustersState> {
        const state = await this.getState();
        return {
            version: 1,
            sortMode: state.sortMode,
            clusterOrder: [...state.clusterOrder],
            manualUnclusteredOrder: [...state.manualUnclusteredOrder],
            clusters: Object.fromEntries(
                Object.entries(state.clusters).map(([id, cluster]) => [
                    id,
                    {
                        id: cluster.id,
                        name: cluster.name,
                        pipelinePaths: [...cluster.pipelinePaths]
                    }
                ])
            )
        };
    }

    private async persistState(state: PipelineClustersState): Promise<void> {
        await savePipelineClustersState(state);
        this.stateCache = state;
        this.refresh();
    }

    private invalidateStateCache(): void {
        this.stateCache = null;
        this.refresh();
    }

    private createClusterId(name: string, state: PipelineClustersState): string {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'cluster';
        let id = base;
        let suffix = 2;
        while (state.clusters[id]) {
            id = `${base}-${suffix++}`;
        }
        return id;
    }

    private addPipelinePathToCluster(state: PipelineClustersState, relativePath: string, clusterId: string): void {
        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return;
        }
        const normalized = sanitizePipelineRelativePath(relativePath);
        if (!normalized) {
            return;
        }
        if (!cluster.pipelinePaths.includes(normalized)) {
            cluster.pipelinePaths.push(normalized);
        }
    }

    private reorderPipelineInCluster(
        state: PipelineClustersState,
        clusterId: string,
        sourcePath: string,
        targetPath: string
    ): void {
        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return;
        }
        const source = sanitizePipelineRelativePath(sourcePath);
        const target = sanitizePipelineRelativePath(targetPath);
        const list = [...cluster.pipelinePaths];
        const sourceIndex = list.indexOf(source);
        const targetIndex = list.indexOf(target);
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
            return;
        }
        list.splice(sourceIndex, 1);
        const nextIndex = list.indexOf(target);
        list.splice(nextIndex < 0 ? list.length : nextIndex, 0, source);
        cluster.pipelinePaths = list;
    }

    private sortClusterManualList(state: PipelineClustersState, clusterId: string): void {
        const cluster = state.clusters[clusterId];
        if (!cluster) {
            return;
        }
        cluster.pipelinePaths = [...new Set(cluster.pipelinePaths)];
    }
}

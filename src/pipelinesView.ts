import * as vscode from 'vscode';
import { readPipelineFromUri } from './pipelineRunner';

export type PipelineItem = {
    uri: vscode.Uri;
    profile?: string;
    stepsCount?: number;
    providers?: string[];
};

export class PipelinesTreeDataProvider implements vscode.TreeDataProvider<PipelineItem> {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    refresh(): void {
        this.emitter.fire();
    }

    getTreeItem(element: PipelineItem): vscode.TreeItem {
        const item = new vscode.TreeItem(this.getLabel(element));
        item.resourceUri = element.uri;
        item.contextValue = 'pipelineItem';
        item.iconPath = new vscode.ThemeIcon('list-tree');
        item.command = {
            command: 'intentRouter.pipelines.openBuilder',
            title: 'Open Pipeline Builder',
            arguments: [element.uri]
        };
        item.description = this.getDescription(element);
        item.tooltip = this.getTooltip(element);
        return item;
    }

    async getChildren(): Promise<PipelineItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const files = await vscode.workspace.findFiles('pipeline/*.intent.json');
        const items: PipelineItem[] = [];
        for (const uri of files) {
            const pipeline = await readPipelineFromUri(uri);
            if (!pipeline) {
                items.push({ uri });
                continue;
            }
            items.push({
                uri,
                profile: pipeline.profile,
                stepsCount: pipeline.steps.length,
                providers: this.extractProviders(pipeline.steps)
            });
        }
        return items;
    }

    private getLabel(item: PipelineItem): string {
        const parts = item.uri.path.split('/');
        const file = parts[parts.length - 1] || 'pipeline';
        return file.replace('.intent.json', '');
    }

    private getDescription(item: PipelineItem): string {
        const parts: string[] = [];
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

    private extractProviders(steps: Array<{ capabilities?: string[] }>): string[] {
        const counts = new Map<string, number>();
        for (const step of steps) {
            const cap = step.capabilities?.[0];
            if (!cap) {
                continue;
            }
            const provider = cap.split('.')[0] || 'custom';
            counts.set(provider, (counts.get(provider) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([provider]) => provider);
        return sorted.slice(0, 2);
    }
}

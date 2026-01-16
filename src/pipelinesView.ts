import * as vscode from 'vscode';

export type PipelineItem = {
    uri: vscode.Uri;
};

export class PipelinesTreeDataProvider implements vscode.TreeDataProvider<PipelineItem> {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    refresh(): void {
        this.emitter.fire();
    }

    getTreeItem(element: PipelineItem): vscode.TreeItem {
        const item = new vscode.TreeItem(this.getLabel(element.uri));
        item.resourceUri = element.uri;
        item.contextValue = 'pipelineItem';
        item.command = {
            command: 'intentRouter.pipelines.openBuilder',
            title: 'Open Pipeline Builder',
            arguments: [element.uri]
        };
        return item;
    }

    async getChildren(): Promise<PipelineItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const files = await vscode.workspace.findFiles('pipeline/*.intent.json');
        return files.map(uri => ({ uri }));
    }

    private getLabel(uri: vscode.Uri): string {
        const parts = uri.path.split('/');
        const file = parts[parts.length - 1] || 'pipeline';
        return file.replace('.intent.json', '');
    }
}

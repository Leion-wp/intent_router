import * as vscode from 'vscode';
import { listPublicCapabilities } from './registry';
import { PipelineFile, ensurePipelineFolder, writePipelineToUri } from './pipelineRunner';
import { gitTemplates } from './providers/gitAdapter';
import { dockerTemplates } from './providers/dockerAdapter';
import { terminalTemplates } from './providers/terminalAdapter';
import { pipelineEventBus } from './eventBus';

type CommandGroup = {
    provider: string;
    commands: string[];
};

export class PipelineBuilder {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    async open(pipeline?: PipelineFile, uri?: vscode.Uri): Promise<void> {
        // If we already have a panel, reveal it. But if opening a different URI, we might want to replace content.
        // For V1, simplest is to allow multiple panels or just one singleton. Let's do singleton for now.
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            // TODO: Update content if needed? For now we assume new open call replaces old one or creates new if disposed.
            // Actually, let's just dispose old one if different URI for simplicity.
        }

        this.currentUri = uri;
        const panel = vscode.window.createWebviewPanel(
            'intentRouter.pipelineBuilder',
            this.getTitle(pipeline, uri),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle')
                ]
            }
        );

        this.panel = panel;

        // Listen to pipeline events to forward to webview
        const eventSub = pipelineEventBus.on(e => {
            if (this.panel && this.panel.visible) {
               if (e.type === 'stepStart' || e.type === 'stepEnd') {
                   this.panel.webview.postMessage({
                       type: 'executionStatus',
                       index: e.index,
                       status: e.type === 'stepStart' ? 'running' : (e.success ? 'success' : 'failure')
                   });
               }
            }
        });
        this.disposables.push(eventSub);

        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = undefined;
                this.dispose();
            }
        });

        const commandGroups = await this.getCommandGroups();
        const profileNames = this.getProfileNames();
        const initialPipeline = pipeline ?? { name: '', steps: [] };
        const templates = { ...gitTemplates, ...dockerTemplates, ...terminalTemplates };

        const webviewUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );

        panel.webview.html = this.getHtml(panel.webview, webviewUri, styleUri, {
            pipeline: initialPipeline,
            commandGroups,
            profiles: profileNames,
            templates
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === 'savePipeline') {
                await this.savePipeline(message.pipeline as PipelineFile);
                vscode.window.showInformationMessage('Pipeline saved successfully.');
                return;
            }
        });
    }

    private dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    private getTitle(pipeline?: PipelineFile, uri?: vscode.Uri): string {
        if (pipeline?.name) {
            return `Pipeline Builder: ${pipeline.name}`;
        }
        if (uri) {
            return `Pipeline Builder: ${this.baseName(uri)}`;
        }
        return 'Pipeline Builder';
    }

    private baseName(uri: vscode.Uri): string {
        const parts = uri.path.split('/');
        return parts[parts.length - 1] || 'pipeline';
    }

    private async savePipeline(pipeline: PipelineFile): Promise<boolean> {
        if (!pipeline.name) {
            vscode.window.showErrorMessage('Pipeline name is required.');
            return false;
        }
        let targetUri = this.currentUri;
        if (!targetUri) {
            const folder = await ensurePipelineFolder();
            if (!folder) return false;
            const fileName = pipeline.name.endsWith('.intent.json') ? pipeline.name : `${pipeline.name}.intent.json`;
            targetUri = vscode.Uri.joinPath(folder, fileName);
            this.currentUri = targetUri;
        }
        await writePipelineToUri(targetUri, pipeline);
        if (this.panel) this.panel.title = this.getTitle(pipeline, targetUri);
        return true;
    }

    private async getCommandGroups(): Promise<CommandGroup[]> {
        const capabilities = listPublicCapabilities();
        const groups = new Map<string, Set<string>>();
        for (const entry of capabilities) {
            const provider = entry.provider || 'custom';
            if (!groups.has(provider)) groups.set(provider, new Set());
            groups.get(provider)?.add(entry.capability);
        }
        return Array.from(groups.entries()).map(([provider, cmds]) => ({
            provider, commands: Array.from(cmds).sort()
        })).sort((a, b) => a.provider.localeCompare(b.provider));
    }

    private getProfileNames(): string[] {
        const profiles = vscode.workspace.getConfiguration('intentRouter').get<any[]>('profiles', []);
        return Array.isArray(profiles) ? profiles.map(p => p?.name).filter(v => typeof v === 'string') : [];
    }

    private getHtml(webview: vscode.Webview, scriptUri: vscode.Uri, styleUri: vscode.Uri, data: any): string {
        const nonce = this.getNonce();
        const payload = JSON.stringify(data);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <title>Pipeline Builder</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.vscode = acquireVsCodeApi();
        window.initialData = ${payload};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

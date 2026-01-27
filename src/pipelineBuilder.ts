import * as vscode from 'vscode';
import { listPublicCapabilities } from './registry';
import { PipelineFile, ensurePipelineFolder, writePipelineToUri } from './pipelineRunner';
import { gitTemplates } from './providers/gitAdapter';
import { dockerTemplates } from './providers/dockerAdapter';
import { terminalTemplates } from './providers/terminalAdapter';
import { pipelineEventBus } from './eventBus';
import { generateSecureNonce } from './security';
import { Capability, CompositeCapability } from './types';
import { historyManager } from './historyManager';

type CommandGroup = {
    provider: string;
    commands: (Capability | CompositeCapability)[];
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
            // Dispose the previous panel to avoid stacking event listeners and message handlers.
            const oldPanel = this.panel;
            this.panel = undefined;
            this.dispose();
            oldPanel.dispose();
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
                    vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle'),
                    vscode.Uri.joinPath(this.extensionUri, 'media')
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
	                       stepId: e.stepId,
	                       status: e.type === 'stepStart' ? 'running' : (e.success ? 'success' : 'failure'),
	                       intentId: e.intentId
	                   });
	               }

	               if (e.type === 'stepLog') {
	                   this.panel.webview.postMessage({
	                       type: 'stepLog',
	                       runId: e.runId,
	                       intentId: e.intentId,
	                       stepId: e.stepId,
	                       text: e.text,
	                       stream: e.stream
	                   });
	               }

               if (e.type === 'pipelineStart' || e.type === 'pipelineEnd') {
                   this.panel.webview.postMessage({
                       type: 'historyUpdate',
                       history: historyManager.getHistory()
                   });
               }
            }
        });
        this.disposables.push(eventSub);

        // Keep ENV panel in sync if user edits workspace settings while builder is open.
        const configSub = vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('intentRouter.environment')) {
                return;
            }
            try {
                const environment = vscode.workspace.getConfiguration('intentRouter').get('environment') || {};
                this.panel?.webview.postMessage({
                    type: 'environmentUpdate',
                    environment
                });
            } catch {
                // Best-effort sync.
            }
        });
        this.disposables.push(configSub);

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
	        await historyManager.whenReady();
	        const history = historyManager.getHistory();
	        const environment = vscode.workspace.getConfiguration('intentRouter').get('environment') || {};

        const webviewUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );
        const codiconUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );

        panel.webview.html = this.getHtml(panel.webview, webviewUri, styleUri, codiconUri, {
            pipeline: initialPipeline,
            commandGroups,
            profiles: profileNames,
            templates,
            history,
            environment
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === 'savePipeline') {
                await this.savePipeline(message.pipeline as PipelineFile);
                vscode.window.showInformationMessage('Pipeline saved successfully.');
                return;
            }
            if (message?.type === 'saveEnvironment') {
                await vscode.workspace.getConfiguration('intentRouter').update(
                    'environment',
                    message.environment,
                    vscode.ConfigurationTarget.Workspace
                );
                // Confirm back to UI (optional, but good for sync)
                this.panel?.webview.postMessage({
                    type: 'environmentUpdate',
                    environment: message.environment
                });
                return;
            }
            if (message?.type === 'clearHistory') {
                await historyManager.clearHistory();
                this.panel?.webview.postMessage({
                    type: 'historyUpdate',
                    history: historyManager.getHistory()
                });
                return;
            }
            if (message?.type === 'selectPath') {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select'
                });
                if (uris && uris.length > 0) {
                    const path = uris[0].fsPath;
                    this.panel?.webview.postMessage({
                        type: 'pathSelected',
                        id: message.id,
                        argName: message.argName,
                        path: path
                    });
                }
                return;
            }
            if (message?.type === 'fetchOptions') {
                const { command, argName } = message;
                try {
                    // Execute the internal command to fetch options
                    const options = await vscode.commands.executeCommand(command);
                    if (Array.isArray(options)) {
                        this.panel?.webview.postMessage({
                            type: 'optionsFetched',
                            argName,
                            options
                        });
                    } else {
                         console.warn(`Dynamic options command ${command} did not return an array.`);
                    }
                } catch (error) {
                    console.error(`Failed to fetch dynamic options for ${command}:`, error);
                }
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
        const groups = new Map<string, (Capability | CompositeCapability)[]>();

        for (const entry of capabilities) {
            const provider = entry.provider || 'custom';
            if (!groups.has(provider)) groups.set(provider, []);
            groups.get(provider)?.push(entry);
        }

        return Array.from(groups.entries()).map(([provider, cmds]) => ({
            provider,
            commands: cmds.sort((a, b) => a.capability.localeCompare(b.capability))
        })).sort((a, b) => a.provider.localeCompare(b.provider));
    }

    private getProfileNames(): string[] {
        const profiles = vscode.workspace.getConfiguration('intentRouter').get<any[]>('profiles', []);
        return Array.isArray(profiles) ? profiles.map(p => p?.name).filter(v => typeof v === 'string') : [];
    }

    private getHtml(webview: vscode.Webview, scriptUri: vscode.Uri, styleUri: vscode.Uri, codiconUri: vscode.Uri, data: any): string {
        const nonce = generateSecureNonce();
        // Prevent XSS by escaping < and > in JSON payload
        const payload = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <link href="${codiconUri}" rel="stylesheet" />
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
}

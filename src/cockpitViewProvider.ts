import * as vscode from 'vscode';
import { pipelineEventBus } from './eventBus';
import { historyManager } from './historyManager';
import { generateSecureNonce } from './security';
import { LEION_DELIVERY_CATALOG } from './controlPlane/leionDeliveryCatalog';
import { readSalesCockpitFromWorkspace, writeSalesCockpitToWorkspace } from './salesCockpitStore';
import { connectSalesProvider, disconnectSalesProvider, validateSalesProvider } from './salesProviderConnectionService';
import { createGmailDraft, openGmailDrafts } from './gmailDraftService';
import { exportProductToGoogleSheets, importLeadsFromGoogleSheets, openGoogleSheet } from './googleSheetsSyncService';
import { readEmbeddedUiPreset, resolveUiPreset } from './uiPresetStore';

type CockpitInitialData = {
    mode: 'cockpit';
    history: any[];
    adminMode: boolean;
    uiPreset: any;
    uiPresetRelease: any;
    controlPlaneCatalog: typeof LEION_DELIVERY_CATALOG;
    salesCockpit: any;
};

export class CockpitViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'intentRouterCockpit';

    private view: vscode.WebviewView | undefined;
    private readonly viewDisposables: vscode.Disposable[] = [];

    constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    private get extensionUri(): vscode.Uri {
        return this.extensionContext.extensionUri;
    }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this.disposeView();
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle'),
                vscode.Uri.joinPath(this.extensionUri, 'media')
            ]
        };

        const initialData = await this.buildInitialData();
        webviewView.webview.html = this.getHtml(webviewView.webview, initialData);

        this.viewDisposables.push(
            webviewView.onDidDispose(() => {
                if (this.view === webviewView) {
                    this.view = undefined;
                    this.disposeView();
                }
            })
        );

        this.viewDisposables.push(
            webviewView.webview.onDidReceiveMessage((message) => {
                void this.handleMessage(message);
            })
        );

        this.viewDisposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('leionRoots.adminMode')) {
                    void this.pushUiPreset();
                }
            })
        );

        const uiDraftWatcher = vscode.workspace.createFileSystemWatcher('**/leion-roots.ui.draft.json');
        uiDraftWatcher.onDidChange(() => void this.pushUiPreset());
        uiDraftWatcher.onDidCreate(() => void this.pushUiPreset());
        uiDraftWatcher.onDidDelete(() => void this.pushUiPreset());
        this.viewDisposables.push(uiDraftWatcher);

        const salesCockpitWatcher = vscode.workspace.createFileSystemWatcher('**/.intent-router/sales-cockpit.json');
        salesCockpitWatcher.onDidChange(() => void this.pushSalesCockpit());
        salesCockpitWatcher.onDidCreate(() => void this.pushSalesCockpit());
        salesCockpitWatcher.onDidDelete(() => void this.pushSalesCockpit());
        this.viewDisposables.push(salesCockpitWatcher);

        this.viewDisposables.push(
            pipelineEventBus.on((event) => {
                if (
                    event.type === 'pipelineStart' ||
                    event.type === 'pipelineEnd' ||
                    event.type === 'githubPullRequestCreated'
                ) {
                    void this.pushHistory();
                }
            })
        );
    }

    dispose(): void {
        this.disposeView();
        this.view = undefined;
    }

    private disposeView(): void {
        while (this.viewDisposables.length > 0) {
            const disposable = this.viewDisposables.pop();
            try {
                disposable?.dispose();
            } catch {
                // Best effort cleanup for view-bound disposables.
            }
        }
    }

    private async buildInitialData(): Promise<CockpitInitialData> {
        await historyManager.whenReady();
        const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
        return {
            mode: 'cockpit',
            history: historyManager.getHistory(),
            adminMode,
            uiPreset: await resolveUiPreset(this.extensionUri, adminMode),
            uiPresetRelease: await readEmbeddedUiPreset(this.extensionUri),
            controlPlaneCatalog: LEION_DELIVERY_CATALOG,
            salesCockpit: await readSalesCockpitFromWorkspace()
        };
    }

    private async pushHistory(): Promise<void> {
        await historyManager.whenReady();
        await this.postMessage({
            type: 'historyUpdate',
            history: historyManager.getHistory()
        });
    }

    private async pushUiPreset(): Promise<void> {
        const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
        await this.postMessage({
            type: 'adminModeUpdate',
            adminMode
        });
        await this.postMessage({
            type: 'uiPresetUpdate',
            uiPreset: await resolveUiPreset(this.extensionUri, adminMode)
        });
        await this.postMessage({
            type: 'uiPresetReleaseUpdate',
            uiPreset: await readEmbeddedUiPreset(this.extensionUri)
        });
    }

    private async pushSalesCockpit(): Promise<void> {
        await this.postMessage({
            type: 'salesCockpitUpdate',
            salesCockpit: await readSalesCockpitFromWorkspace()
        });
    }

    private async handleMessage(message: any): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        if (message.type === 'salesCockpit.save') {
            const next = await writeSalesCockpitToWorkspace(message.salesCockpit as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.connectProvider') {
            const next = await connectSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            if (next) {
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            }
            return;
        }

        if (message.type === 'salesCockpit.validateProvider') {
            const next = await validateSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.disconnectProvider') {
            const next = await disconnectSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.createGmailDraft') {
            try {
                const result = await createGmailDraft(this.extensionContext, {
                    to: String(message.to || '').trim(),
                    subject: String(message.subject || '').trim(),
                    body: String(message.body || '')
                });
                await openGmailDrafts();
                vscode.window.showInformationMessage(`Gmail draft created${result.id ? ` (${result.id})` : ''}.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to create Gmail draft: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.syncGoogleSheet') {
            try {
                const direction = String(message.direction || '').trim();
                const sheetUrl = String(message.sheetUrl || '').trim();
                if (!sheetUrl) {
                    throw new Error('Missing Google Sheet URL.');
                }
                if (direction === 'export') {
                    await exportProductToGoogleSheets(this.extensionContext, {
                        sheetUrl,
                        offer: message.offer,
                        leads: Array.isArray(message.leads) ? message.leads : []
                    });
                    await openGoogleSheet(sheetUrl);
                    vscode.window.showInformationMessage('Google Sheets export completed.');
                } else if (direction === 'import') {
                    const importedLeads = await importLeadsFromGoogleSheets(this.extensionContext, sheetUrl);
                    const current = await readSalesCockpitFromWorkspace();
                    const next = await writeSalesCockpitToWorkspace({
                        ...current,
                        leads: importedLeads,
                        defaultSheetUrl: sheetUrl
                    } as any);
                    await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                    await openGoogleSheet(sheetUrl);
                    vscode.window.showInformationMessage(`Imported ${importedLeads.length} leads from Google Sheets.`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Google Sheets sync failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'copyToClipboard') {
            await vscode.env.clipboard.writeText(String(message.text || ''));
            return;
        }

        if (message.type === 'openExternal') {
            try {
                const raw = String(message.url || '').trim();
                const uri = vscode.Uri.parse(raw);
                if (uri.scheme !== 'http' && uri.scheme !== 'https') {
                    throw new Error('Only http/https links are allowed.');
                }
                await vscode.env.openExternal(uri);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open link: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'openWorkspaceFile') {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!workspaceRoot) {
                    throw new Error('Open a workspace folder first.');
                }
                const rawPath = String(message.path || '').trim().replace(/\\/g, '/');
                if (!rawPath) {
                    throw new Error('Missing workspace-relative path.');
                }
                if (rawPath.startsWith('/') || rawPath.includes('..')) {
                    throw new Error('Only safe workspace-relative paths are allowed.');
                }
                const parts = rawPath.split('/').map((part) => part.trim()).filter(Boolean);
                const uri = vscode.Uri.joinPath(workspaceRoot, ...parts);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open file: ${error?.message || error}`);
            }
        }
    }

    private async postMessage(message: Record<string, unknown>): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            await this.view.webview.postMessage(message);
        } catch {
            // Ignore best-effort sync failures when the view is not ready.
        }
    }

    private getHtml(webview: vscode.Webview, initialData: CockpitInitialData): string {
        const nonce = generateSecureNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );
        const serializedInitialData = JSON.stringify(initialData)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <link href="${codiconUri}" rel="stylesheet" />
    <title>Leion Cockpit</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.vscode = acquireVsCodeApi();
        window.initialData = ${serializedInitialData};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

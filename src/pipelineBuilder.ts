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
import * as path from 'path';
import { deleteCustomNodeInWorkspace, exportCustomNodes, importCustomNodesJson, readCustomNodesFromWorkspace, upsertCustomNodeInWorkspace, writeCustomNodesToWorkspace } from './customNodesStore';
import {
    deleteUiDraftFromWorkspace,
    getDefaultUiPreset,
    getEmbeddedUiPresetUri,
    readEmbeddedUiPreset,
    readUiDraftFromWorkspace,
    resolveUiPreset,
    writeEmbeddedUiPreset,
    writeUiDraftToWorkspace
} from './uiPresetStore';

type CommandGroup = {
    provider: string;
    commands: (Capability | CompositeCapability)[];
};

function summarizeUiPresetDiff(releasePreset: any, draftPreset: any): string {
    const releaseTabs = Array.isArray(releasePreset?.sidebar?.tabs) ? releasePreset.sidebar.tabs : [];
    const draftTabs = Array.isArray(draftPreset?.sidebar?.tabs) ? draftPreset.sidebar.tabs : [];
    const releaseCategories = Array.isArray(releasePreset?.palette?.categories) ? releasePreset.palette.categories : [];
    const draftCategories = Array.isArray(draftPreset?.palette?.categories) ? draftPreset.palette.categories : [];
    const releasePinned = Array.isArray(releasePreset?.palette?.pinned) ? releasePreset.palette.pinned : [];
    const draftPinned = Array.isArray(draftPreset?.palette?.pinned) ? draftPreset.palette.pinned : [];
    const releaseTheme = releasePreset?.theme?.tokens || {};
    const draftTheme = draftPreset?.theme?.tokens || {};

    const changedTabs = JSON.stringify(releaseTabs) !== JSON.stringify(draftTabs);
    const changedCategories = JSON.stringify(releaseCategories) !== JSON.stringify(draftCategories);
    const changedPinned = JSON.stringify(releasePinned) !== JSON.stringify(draftPinned);
    const changedTheme = JSON.stringify(releaseTheme) !== JSON.stringify(draftTheme);

    return [
        changedTheme ? 'theme: changed' : 'theme: unchanged',
        changedTabs ? `sidebar tabs: ${releaseTabs.length} -> ${draftTabs.length}` : `sidebar tabs: unchanged (${draftTabs.length})`,
        changedCategories ? 'palette categories: changed' : `palette categories: unchanged (${draftCategories.length})`,
        changedPinned ? `palette pinned: ${releasePinned.length} -> ${draftPinned.length}` : `palette pinned: unchanged (${draftPinned.length})`
    ].join(' | ');
}

function validateUiPresetForPropagation(preset: any): string[] {
    const errors: string[] = [];
    const tabs = Array.isArray(preset?.sidebar?.tabs) ? preset.sidebar.tabs : [];
    if (!tabs.length) {
        errors.push('sidebar.tabs must contain at least one tab.');
    } else {
        const seen = new Set<string>();
        for (const tab of tabs) {
            const id = String(tab?.id || '').trim();
            if (!id) {
                errors.push('sidebar.tabs contains an empty id.');
                continue;
            }
            if (seen.has(id)) {
                errors.push(`sidebar.tabs contains duplicate id: ${id}.`);
            }
            seen.add(id);
        }
        if (!tabs.some((tab: any) => tab?.visible !== false)) {
            errors.push('At least one sidebar tab must be visible.');
        }
    }

    const categories = Array.isArray(preset?.palette?.categories) ? preset.palette.categories : [];
    const requiredCategories = ['context', 'providers', 'custom'];
    for (const required of requiredCategories) {
        if (!categories.some((entry: any) => String(entry?.id || '').trim() === required)) {
            errors.push(`palette.categories is missing "${required}".`);
        }
    }
    return errors;
}

export class PipelineBuilder {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;
    private lastSavedName: string | undefined;
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
        this.lastSavedName = pipeline?.name;
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
            if (this.panel) {
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

        const pushUiPreset = async () => {
            const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
            const uiPreset = await resolveUiPreset(this.extensionUri, adminMode);
            const uiPresetRelease = await readEmbeddedUiPreset(this.extensionUri);
            this.panel?.webview.postMessage({ type: 'adminModeUpdate', adminMode });
            this.panel?.webview.postMessage({ type: 'uiPresetUpdate', uiPreset });
            this.panel?.webview.postMessage({ type: 'uiPresetReleaseUpdate', uiPreset: uiPresetRelease });
        };

        // Keep ENV panel and admin flags in sync if settings change while builder is open.
        const configSub = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('leionRoots.adminMode')) {
                void pushUiPreset();
            }
            if (!e.affectsConfiguration('intentRouter.environment')) return;
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
            const customNodes = await readCustomNodesFromWorkspace();
            const devMode = vscode.workspace.getConfiguration('intentRouter').get<boolean>('devMode', false);
            const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
            const uiPreset = await resolveUiPreset(this.extensionUri, adminMode);
            const uiPresetRelease = await readEmbeddedUiPreset(this.extensionUri);

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
            pipelineUri: uri ? uri.toString() : null,
            commandGroups,
            profiles: profileNames,
            templates,
            history,
            environment,
            customNodes,
            devMode,
            adminMode,
            uiPreset,
            uiPresetRelease
        });

        // Keep custom nodes in sync while builder is open
        const customNodesWatcher = vscode.workspace.createFileSystemWatcher('**/.intent-router/nodes.json');
        const pushCustomNodes = async () => {
            try {
                const nodes = await readCustomNodesFromWorkspace();
                this.panel?.webview.postMessage({ type: 'customNodesUpdate', nodes });
            } catch {
                // best-effort
            }
        };
        customNodesWatcher.onDidChange(pushCustomNodes);
        customNodesWatcher.onDidCreate(pushCustomNodes);
        customNodesWatcher.onDidDelete(pushCustomNodes);
        this.disposables.push(customNodesWatcher);

        const uiDraftWatcher = vscode.workspace.createFileSystemWatcher('**/leion-roots.ui.draft.json');
        uiDraftWatcher.onDidChange(() => void pushUiPreset());
        uiDraftWatcher.onDidCreate(() => void pushUiPreset());
        uiDraftWatcher.onDidDelete(() => void pushUiPreset());
        this.disposables.push(uiDraftWatcher);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === 'savePipeline') {
                await this.savePipeline(message.pipeline as PipelineFile);
                if (!message?.silent) {
                    vscode.window.showInformationMessage('Pipeline saved successfully.');
                }
                return;
            }
            if (message?.type === 'runPipeline') {
                await vscode.commands.executeCommand(
                    'intentRouter.runPipelineFromData',
                    message.pipeline as PipelineFile,
                    !!message.dryRun
                );
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
            if (message?.type === 'customNodes.upsert') {
                try {
                    const nodes = await upsertCustomNodeInWorkspace(message.node);
                    this.panel?.webview.postMessage({ type: 'customNodesUpdate', nodes });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to save custom node: ${e?.message || e}`);
                }
                return;
            }
            if (message?.type === 'customNodes.delete') {
                try {
                    const nodes = await deleteCustomNodeInWorkspace(String(message.id || ''));
                    this.panel?.webview.postMessage({ type: 'customNodesUpdate', nodes });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to delete custom node: ${e?.message || e}`);
                }
                return;
            }
            if (message?.type === 'customNodes.export') {
                try {
                    const nodes = await readCustomNodesFromWorkspace();
                    const scope = String(message.scope || 'all');
                    const id = String(message.id || '');
                    const selected = scope === 'one' ? nodes.find(n => n.id === id) : undefined;
                    const json = exportCustomNodes(selected ? selected : nodes);
                    await vscode.env.clipboard.writeText(json);
                    this.panel?.webview.postMessage({ type: 'customNodesExported', scope, id, json });
                    vscode.window.showInformationMessage('Custom nodes JSON copied to clipboard.');
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to export custom nodes: ${e?.message || e}`);
                }
                return;
            }
            if (message?.type === 'customNodes.import') {
                try {
                    const source = String(message.source || 'paste');
                    let jsonText = String(message.jsonText || '');

                    if (source === 'file') {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Import',
                            filters: { JSON: ['json'] }
                        });
                        if (!uris || uris.length === 0) {
                            return;
                        }
                        const bytes = await vscode.workspace.fs.readFile(uris[0]);
                        jsonText = Buffer.from(bytes).toString('utf8');
                    }

                    const existing = await readCustomNodesFromWorkspace();
                    const { merged, imported, renames } = importCustomNodesJson(existing, jsonText);
                    await writeCustomNodesToWorkspace(merged);
                    this.panel?.webview.postMessage({ type: 'customNodesUpdate', nodes: merged });
                    this.panel?.webview.postMessage({ type: 'customNodesImported', imported, renames, total: merged.length });
                    vscode.window.showInformationMessage(`Imported ${imported.length} custom node(s).`);
                } catch (e: any) {
                    const msg = e?.message || String(e);
                    vscode.window.showErrorMessage(`Failed to import custom nodes: ${msg}`);
                    this.panel?.webview.postMessage({ type: 'customNodesImportError', message: msg });
                }
                return;
            }
            if (message?.type === 'uiPreset.saveDraft') {
                try {
                    await writeUiDraftToWorkspace(message.uiPreset);
                    await pushUiPreset();
                } catch (e: any) {
                    const err = String(e?.message || e);
                    this.panel?.webview.postMessage({ type: 'error', message: `Failed to save UI draft: ${err}` });
                }
                return;
            }
            if (message?.type === 'uiPreset.resetDraft') {
                try {
                    await deleteUiDraftFromWorkspace();
                    await pushUiPreset();
                } catch (e: any) {
                    const err = String(e?.message || e);
                    this.panel?.webview.postMessage({ type: 'error', message: `Failed to reset UI draft: ${err}` });
                }
                return;
            }
            if (message?.type === 'uiPreset.exportCurrent') {
                try {
                    const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
                    const uiPreset = await resolveUiPreset(this.extensionUri, adminMode);
                    const json = JSON.stringify(uiPreset, null, 2);
                    await vscode.env.clipboard.writeText(json);
                    this.panel?.webview.postMessage({ type: 'uiPresetExported', json });
                    vscode.window.showInformationMessage('UI preset JSON copied to clipboard.');
                } catch (e: any) {
                    const err = String(e?.message || e);
                    this.panel?.webview.postMessage({ type: 'error', message: `Failed to export UI preset: ${err}` });
                }
                return;
            }
            if (message?.type === 'uiPreset.importDraft') {
                try {
                    let text = String(message.jsonText || '').trim();
                    const source = String(message.source || 'paste');
                    if (source === 'file') {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Import Theme Preset',
                            filters: { JSON: ['json'] }
                        });
                        if (!uris || uris.length === 0) {
                            return;
                        }
                        const bytes = await vscode.workspace.fs.readFile(uris[0]);
                        text = Buffer.from(bytes).toString('utf8').trim();
                    }
                    if (!text) throw new Error('Empty JSON');
                    const parsed = JSON.parse(text);
                    await writeUiDraftToWorkspace(parsed);
                    await pushUiPreset();
                } catch (e: any) {
                    const err = String(e?.message || e);
                    this.panel?.webview.postMessage({ type: 'error', message: `Failed to import UI preset: ${err}` });
                }
                return;
            }
            if (message?.type === 'uiPreset.resetToDefaults') {
                try {
                    await writeUiDraftToWorkspace(getDefaultUiPreset());
                    await pushUiPreset();
                } catch (e: any) {
                    const err = String(e?.message || e);
                    this.panel?.webview.postMessage({ type: 'error', message: `Failed to reset UI preset to defaults: ${err}` });
                }
                return;
            }
            if (message?.type === 'uiPreset.propagateDraft') {
                try {
                    const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
                    if (!adminMode) {
                        this.panel?.webview.postMessage({ type: 'error', message: 'UI propagate is available only in admin mode.' });
                        return;
                    }

                    const draft = await readUiDraftFromWorkspace();
                    if (!draft) {
                        this.panel?.webview.postMessage({ type: 'error', message: 'No UI draft found. Save a draft first.' });
                        return;
                    }

                    const validationErrors = validateUiPresetForPropagation(draft);
                    if (validationErrors.length > 0) {
                        this.panel?.webview.postMessage({
                            type: 'error',
                            message: `UI draft is invalid for propagation: ${validationErrors.join(' ')}`
                        });
                        return;
                    }

                    const releasePreset = await readEmbeddedUiPreset(this.extensionUri);
                    const summary = summarizeUiPresetDiff(releasePreset, draft);
                    if (JSON.stringify(releasePreset) === JSON.stringify(draft)) {
                        this.panel?.webview.postMessage({
                            type: 'error',
                            message: 'Draft and release presets are identical. Nothing to propagate.'
                        });
                        return;
                    }
                    const decision = await vscode.window.showWarningMessage(
                        `Propagate UI draft to release preset?\n${summary}`,
                        { modal: true },
                        'Propagate'
                    );
                    if (decision !== 'Propagate') {
                        return;
                    }

                    const releaseUri = await writeEmbeddedUiPreset(this.extensionUri, draft);
                    await pushUiPreset();
                    this.panel?.webview.postMessage({
                        type: 'uiPresetPropagated',
                        summary,
                        releasePath: releaseUri.fsPath
                    });
                    vscode.window.showInformationMessage(`UI preset propagated to release: ${releaseUri.fsPath}`);
                } catch (e: any) {
                    const err = String(e?.message || e);
                    const releasePath = getEmbeddedUiPresetUri(this.extensionUri).fsPath;
                    this.panel?.webview.postMessage({
                        type: 'error',
                        message: `Failed to propagate UI preset to ${releasePath}: ${err}`
                    });
                }
                return;
            }
            if (message?.type === 'devPackager.loadPreset') {
                const enabled = vscode.workspace.getConfiguration('intentRouter').get<boolean>('devMode', false);
                if (!enabled) {
                    vscode.window.showWarningMessage('Dev mode is disabled. Enable "Intent Router: Dev Mode" in workspace settings.');
                    return;
                }
                const preset = buildDevPackagerPreset();
                this.panel?.webview.postMessage({ type: 'loadPipeline', pipeline: preset });
                vscode.window.showInformationMessage('Loaded Dev Packager preset in the builder.');
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
        } else {
            // If the pipeline name changed, rename the file to match (same folder).
            const desiredFileName = pipeline.name.endsWith('.intent.json') ? pipeline.name : `${pipeline.name}.intent.json`;
            const currentFileName = path.posix.basename(targetUri.path);
            const shouldRename = typeof this.lastSavedName === 'string' && pipeline.name !== this.lastSavedName;
            if (shouldRename && desiredFileName !== currentFileName) {
                const parent = vscode.Uri.joinPath(targetUri, '..');
                const newUri = vscode.Uri.joinPath(parent, desiredFileName);
                try {
                    await vscode.workspace.fs.stat(newUri);
                    vscode.window.showErrorMessage(`Cannot rename pipeline: ${desiredFileName} already exists.`);
                    return false;
                } catch {
                    // ok, target doesn't exist
                }
                try {
                    await vscode.workspace.fs.rename(targetUri, newUri, { overwrite: false });
                    targetUri = newUri;
                    this.currentUri = newUri;
                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to rename pipeline file: ${e}`);
                    return false;
                }
            }
        }
        await writePipelineToUri(targetUri, pipeline);
        if (this.panel) this.panel.title = this.getTitle(pipeline, targetUri);
        this.lastSavedName = pipeline.name;
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

function buildDevPackagerPreset(): PipelineFile {
    // Keep the output VSIX path stable (no parsing output).
    // Use relative path for install step; vscode.installVsix resolves relative to workspace root.
    return {
        name: 'Dev Packager',
        description: 'Dev-only preset: build and install the current extension VSIX, then reload VS Code.',
        steps: [
            {
                id: 'dev.npmInstall',
                intent: 'terminal.run',
                description: 'npm install',
                payload: { command: 'npm install', cwd: '${workspaceRoot}' }
            },
            {
                id: 'dev.compile',
                intent: 'terminal.run',
                description: 'npm run compile',
                payload: { command: 'npm run compile', cwd: '${workspaceRoot}' }
            },
            {
                id: 'dev.vscePackage',
                intent: 'terminal.run',
                description: 'vsce package (pipeline/dev-build.vsix)',
                payload: { command: 'npx vsce package -o pipeline/dev-build.vsix', cwd: '${workspaceRoot}' }
            },
            {
                id: 'dev.pauseBeforeInstall',
                intent: 'system.pause',
                description: 'Pause before install',
                payload: { message: 'About to install pipeline/dev-build.vsix into VS Code. Review changes, then Continue.' }
            },
            {
                id: 'dev.installVsix',
                intent: 'vscode.installVsix',
                description: 'Install VSIX',
                payload: { vsixPath: 'pipeline/dev-build.vsix' }
            },
            {
                id: 'dev.pauseBeforeReload',
                intent: 'system.pause',
                description: 'Pause before reload',
                payload: { message: 'VSIX installed. Continue to reload VS Code window?' }
            },
            {
                id: 'dev.reload',
                intent: 'vscode.runCommand',
                description: 'Reload window',
                payload: { commandId: 'workbench.action.reloadWindow', argsJson: '' }
            }
        ]
    };
}

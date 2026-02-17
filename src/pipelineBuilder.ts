import * as vscode from 'vscode';
import { listPublicCapabilities } from './registry';
import { PipelineFile, ensurePipelineFolder, writePipelineToUri, resolveDecision } from './pipelineRunner';
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

               if (e.type === 'approvalReviewReady') {
                   this.panel.webview.postMessage({
                       type: 'approvalReviewReady',
                       runId: e.runId,
                       intentId: e.intentId,
                       stepId: e.stepId,
                       files: e.files,
                       totalAdded: e.totalAdded,
                       totalRemoved: e.totalRemoved,
                       policyMode: e.policyMode,
                       policyBlocked: e.policyBlocked,
                       policyViolations: e.policyViolations
                   });
               }

               if (e.type === 'teamRunSummary') {
                   this.panel.webview.postMessage({
                       type: 'teamRunSummary',
                       runId: e.runId,
                       intentId: e.intentId,
                       stepId: e.stepId,
                       strategy: e.strategy,
                       winnerMember: e.winnerMember,
                       winnerReason: e.winnerReason,
                       voteScoreByMember: e.voteScoreByMember,
                       members: e.members,
                       totalFiles: e.totalFiles
                   });
               }

               if (e.type === 'pipelineStart' || e.type === 'pipelineEnd') {
                    this.panel.webview.postMessage({
                        type: 'historyUpdate',
                        history: historyManager.getHistory()
                    });
                }

               if (e.type === 'githubPullRequestCreated') {
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
            if (message?.type === 'pipelineDecision') {
                resolveDecision(message.nodeId, message.decision, message.runId, message.approvedPaths);
                return;
            }
            if (message?.type === 'pipelineReviewOpenDiff') {
                pipelineEventBus.emit({
                    type: 'pipelineReviewOpenDiff',
                    nodeId: message.nodeId,
                    runId: message.runId,
                    path: message.path
                } as any);
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
            if (message?.type === 'openExternal') {
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
            if (message?.type === 'copyToClipboard') {
                try {
                    await vscode.env.clipboard.writeText(String(message.text || ''));
                    vscode.window.showInformationMessage('Copied to clipboard.');
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to copy: ${error?.message || error}`);
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
                const preset = createDevPackagerPreset();
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

export function createDevPackagerPreset(): PipelineFile {
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

export function createSoftwareFactoryPreset(): PipelineFile {
    return {
        name: 'Software Factory Template',
        description: 'Brainstorm → PRD → Architecture → PR Split with HITL review at every artifact.',
        steps: [
            {
                id: 'team.brainstorm',
                intent: 'ai.team',
                description: 'Team Brainstorm (idea.md -> brainstorm.md)',
                payload: {
                    strategy: 'reviewer_gate',
                    members: [
                        {
                            name: 'brainstorm_writer',
                            role: 'writer',
                            agent: 'gemini',
                            model: 'gemini-2.5-flash',
                            instruction: 'Create a concise brainstorming artifact from idea.md. Output only brainstorm.md content.',
                            contextFiles: ['docs/idea.md']
                        },
                        {
                            name: 'brainstorm_reviewer',
                            role: 'reviewer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Review and improve the brainstorm output. Return only final brainstorm.md content.',
                            contextFiles: ['docs/idea.md']
                        }
                    ],
                    contextFiles: ['docs/idea.md'],
                    agentSpecFiles: ['AGENTS.md', '**/SKILL.md'],
                    outputContract: 'path_result',
                    outputVar: 'brainstorm_result',
                    outputVarPath: 'brainstorm_path',
                    outputVarChanges: 'brainstorm_changes'
                }
            },
            {
                id: 'approve.brainstorm',
                intent: 'vscode.reviewDiff',
                description: 'Review brainstorm artifact',
                payload: {
                    path: '${var:brainstorm_path}',
                    proposal: '${var:brainstorm_result}'
                }
            },
            {
                id: 'team.prd',
                intent: 'ai.team',
                description: 'Team PRD (brainstorm.md -> prd.md)',
                payload: {
                    strategy: 'sequential',
                    members: [
                        {
                            name: 'prd_writer',
                            role: 'writer',
                            agent: 'gemini',
                            model: 'gemini-2.5-flash',
                            instruction: 'Generate a structured PRD from brainstorm.md. Output only prd.md content.',
                            contextFiles: ['docs/brainstorm.md']
                        },
                        {
                            name: 'prd_reviewer',
                            role: 'reviewer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Refine the PRD for implementation readiness. Output only prd.md content.',
                            contextFiles: ['docs/brainstorm.md']
                        }
                    ],
                    contextFiles: ['docs/brainstorm.md'],
                    outputContract: 'path_result',
                    outputVar: 'prd_result',
                    outputVarPath: 'prd_path',
                    outputVarChanges: 'prd_changes'
                }
            },
            {
                id: 'approve.prd',
                intent: 'vscode.reviewDiff',
                description: 'Review PRD artifact',
                payload: {
                    path: '${var:prd_path}',
                    proposal: '${var:prd_result}'
                }
            },
            {
                id: 'team.architecture',
                intent: 'ai.team',
                description: 'Team Architecture (brainstorm+prd -> architecture.md)',
                payload: {
                    strategy: 'vote',
                    members: [
                        {
                            name: 'architect_writer_a',
                            role: 'writer',
                            agent: 'gemini',
                            model: 'gemini-2.5-pro',
                            instruction: 'Create architecture.md from brainstorm + PRD.',
                            contextFiles: ['docs/brainstorm.md', 'docs/prd.md']
                        },
                        {
                            name: 'architect_writer_b',
                            role: 'writer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Create an alternative architecture.md from brainstorm + PRD.',
                            contextFiles: ['docs/brainstorm.md', 'docs/prd.md']
                        },
                        {
                            name: 'architect_reviewer',
                            role: 'reviewer',
                            agent: 'gemini',
                            model: 'gemini-2.5-pro',
                            instruction: 'Choose/refine best architecture outcome and output final architecture.md.',
                            contextFiles: ['docs/brainstorm.md', 'docs/prd.md']
                        }
                    ],
                    contextFiles: ['docs/brainstorm.md', 'docs/prd.md'],
                    outputContract: 'path_result',
                    outputVar: 'architecture_result',
                    outputVarPath: 'architecture_path',
                    outputVarChanges: 'architecture_changes'
                }
            },
            {
                id: 'approve.architecture',
                intent: 'vscode.reviewDiff',
                description: 'Review architecture artifact',
                payload: {
                    path: '${var:architecture_path}',
                    proposal: '${var:architecture_result}'
                }
            },
            {
                id: 'team.pr_split',
                intent: 'ai.team',
                description: 'PR Split Plan (frontend/backend atomic PRs)',
                payload: {
                    strategy: 'sequential',
                    members: [
                        {
                            name: 'split_writer',
                            role: 'writer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Produce pr_split.md with FE/BE atomic PR plan and branch names.',
                            contextFiles: ['docs/prd.md', 'docs/architecture.md']
                        },
                        {
                            name: 'split_reviewer',
                            role: 'reviewer',
                            agent: 'gemini',
                            model: 'gemini-2.5-flash',
                            instruction: 'Review and finalize pr_split.md.',
                            contextFiles: ['docs/prd.md', 'docs/architecture.md']
                        }
                    ],
                    contextFiles: ['docs/prd.md', 'docs/architecture.md'],
                    outputContract: 'path_result',
                    outputVar: 'split_result',
                    outputVarPath: 'split_path',
                    outputVarChanges: 'split_changes'
                }
            },
            {
                id: 'approve.pr_split',
                intent: 'vscode.reviewDiff',
                description: 'Review PR split artifact',
                payload: {
                    path: '${var:split_path}',
                    proposal: '${var:split_result}'
                }
            }
        ]
    };
}

export function createSoftwareFactoryBranchPreset(): PipelineFile {
    return {
        name: 'Software Factory FE-BE Branch Mode',
        description: 'Factory template with FE/BE dedicated branches and PR placeholders.',
        steps: [
            {
                id: 'factory.set_repo_cwd',
                intent: 'system.setCwd',
                description: 'Set repository root',
                payload: { path: '${workspaceRoot}' }
            },
            {
                id: 'factory.capture_release_config',
                intent: 'system.form',
                description: 'Capture branch and ticket configuration',
                payload: {
                    fields: [
                        { type: 'text', key: 'ticketId', label: 'Ticket ID', default: 'TICKET-001', required: true },
                        { type: 'text', key: 'baseBranch', label: 'Base branch', default: 'main', required: true }
                    ]
                }
            },
            {
                id: 'factory.checkout_base',
                intent: 'terminal.run',
                description: 'Checkout base branch and pull latest',
                payload: {
                    cwd: '${workspaceRoot}',
                    command: 'git checkout ${var:baseBranch} && git pull'
                }
            },
            {
                id: 'factory.team_split_plan',
                intent: 'ai.team',
                description: 'Create FE/BE implementation split plan',
                payload: {
                    strategy: 'reviewer_gate',
                    members: [
                        {
                            name: 'split_writer',
                            role: 'writer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Produce implementation split for FE/BE with explicit file ownership and testing notes.',
                            contextFiles: ['docs/prd.md', 'docs/architecture.md']
                        },
                        {
                            name: 'split_reviewer',
                            role: 'reviewer',
                            agent: 'gemini',
                            model: 'gemini-2.5-flash',
                            instruction: 'Review and finalize split plan into docs/pr_split.md.',
                            contextFiles: ['docs/prd.md', 'docs/architecture.md']
                        }
                    ],
                    outputContract: 'path_result',
                    outputVar: 'split_result',
                    outputVarPath: 'split_path',
                    outputVarChanges: 'split_changes'
                }
            },
            {
                id: 'factory.review_split',
                intent: 'vscode.reviewDiff',
                description: 'Review split plan',
                payload: {
                    path: '${var:split_path}',
                    proposal: '${var:split_result}'
                }
            },
            {
                id: 'factory.team_frontend',
                intent: 'ai.team',
                description: 'Frontend team implementation proposal',
                payload: {
                    strategy: 'vote',
                    members: [
                        {
                            name: 'fe_writer',
                            role: 'writer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Generate frontend implementation changes according to pr_split.md.',
                            contextFiles: ['docs/pr_split.md']
                        },
                        {
                            name: 'fe_reviewer',
                            role: 'reviewer',
                            agent: 'gemini',
                            model: 'gemini-2.5-pro',
                            instruction: 'Review frontend proposal and output final result.',
                            contextFiles: ['docs/pr_split.md']
                        }
                    ],
                    outputContract: 'path_result',
                    outputVar: 'fe_result',
                    outputVarPath: 'fe_path',
                    outputVarChanges: 'fe_changes'
                }
            },
            {
                id: 'factory.review_frontend',
                intent: 'vscode.reviewDiff',
                description: 'Review frontend changes',
                payload: {
                    path: '${var:fe_path}',
                    proposal: '${var:fe_result}'
                }
            },
            {
                id: 'factory.push_frontend_branch',
                intent: 'terminal.run',
                description: 'Create/push frontend branch + commit placeholder',
                payload: {
                    cwd: '${workspaceRoot}',
                    command: 'git checkout -B feature/${var:ticketId}-frontend && git add ${var:fe_path} && git commit -m \"feat(frontend): ${var:ticketId}\" && git push -u origin feature/${var:ticketId}-frontend'
                }
            },
            {
                id: 'factory.open_frontend_pr',
                intent: 'github.openPr',
                description: 'Open frontend PR',
                payload: {
                    cwd: '${workspaceRoot}',
                    head: 'feature/${var:ticketId}-frontend',
                    base: '${var:baseBranch}',
                    title: 'feat(frontend): ${var:ticketId}',
                    bodyFile: 'docs/pr_split.md'
                }
            },
            {
                id: 'factory.checkout_base_again',
                intent: 'terminal.run',
                description: 'Return to base branch',
                payload: {
                    cwd: '${workspaceRoot}',
                    command: 'git checkout ${var:baseBranch}'
                }
            },
            {
                id: 'factory.team_backend',
                intent: 'ai.team',
                description: 'Backend team implementation proposal',
                payload: {
                    strategy: 'vote',
                    members: [
                        {
                            name: 'be_writer',
                            role: 'writer',
                            agent: 'codex',
                            model: 'gpt-5-codex',
                            instruction: 'Generate backend implementation changes according to pr_split.md.',
                            contextFiles: ['docs/pr_split.md']
                        },
                        {
                            name: 'be_reviewer',
                            role: 'reviewer',
                            agent: 'gemini',
                            model: 'gemini-2.5-pro',
                            instruction: 'Review backend proposal and output final result.',
                            contextFiles: ['docs/pr_split.md']
                        }
                    ],
                    outputContract: 'path_result',
                    outputVar: 'be_result',
                    outputVarPath: 'be_path',
                    outputVarChanges: 'be_changes'
                }
            },
            {
                id: 'factory.review_backend',
                intent: 'vscode.reviewDiff',
                description: 'Review backend changes',
                payload: {
                    path: '${var:be_path}',
                    proposal: '${var:be_result}'
                }
            },
            {
                id: 'factory.push_backend_branch',
                intent: 'terminal.run',
                description: 'Create/push backend branch + commit placeholder',
                payload: {
                    cwd: '${workspaceRoot}',
                    command: 'git checkout -B feature/${var:ticketId}-backend && git add ${var:be_path} && git commit -m \"feat(backend): ${var:ticketId}\" && git push -u origin feature/${var:ticketId}-backend'
                }
            },
            {
                id: 'factory.open_backend_pr',
                intent: 'github.openPr',
                description: 'Open backend PR',
                payload: {
                    cwd: '${workspaceRoot}',
                    head: 'feature/${var:ticketId}-backend',
                    base: '${var:baseBranch}',
                    title: 'feat(backend): ${var:ticketId}',
                    bodyFile: 'docs/pr_split.md'
                }
            }
        ]
    };
}

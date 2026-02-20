import * as vscode from 'vscode';
import { routeIntent, invalidateLogLevelCache } from './router';
import { Intent, RegisterCapabilitiesArgs } from './types';
import { registerCapabilities } from './registry';
import { generateSecureNonce } from './security';
import { createSoftwareFactoryBranchPreset, createSoftwareFactoryPreset, PipelineBuilder } from './pipelineBuilder';
import { ClusterTreeNode, PipelineTreeNode, PipelinesTreeDataProvider, PipelinesTreeNode } from './pipelinesView';
import { ensurePipelineFolder, readPipelineFromUri, runPipelineFromActiveEditor, runPipelineFromData, runPipelineFromUri, writePipelineToUri, cancelCurrentPipeline, pauseCurrentPipeline, resumeCurrentPipeline } from './pipelineRunner';
import { registerGitProvider } from './providers/gitAdapter';
import { registerDockerProvider } from './providers/dockerAdapter';
import { cancelTerminalRun, executeTerminalCommand, registerTerminalProvider } from './providers/terminalAdapter';
import { registerSystemProvider } from './providers/systemAdapter';
import { registerVSCodeProvider } from './providers/vscodeAdapter';
import { registerAiProvider, executeAiCommand, executeAiTeamCommand } from './providers/aiAdapter';
import { registerHttpProvider, executeHttpCommand } from './providers/httpAdapter';
import { executeGitHubOpenPr, executeGitHubPrChecks, executeGitHubPrComment, executeGitHubPrRerunFailedChecks, registerGitHubProvider } from './providers/githubAdapter';
import { StatusBarManager } from './statusBar';
import { historyManager } from './historyManager';
import { RuntimeTriggerManager } from './runtimeTriggerManager';
import { ChromeBridge } from './chromeBridge';
import { ChromePanelView } from './chromePanelView';

export function activate(context: vscode.ExtensionContext) {
    console.log('Intent Router extension is now active!');
    console.log('HistoryManager initialized', !!historyManager);

    // V1 Providers: Strict discovery
    registerGitProvider(context);
    registerDockerProvider(context);
    registerTerminalProvider(context);
    registerSystemProvider(context);
    registerVSCodeProvider(context);
    registerAiProvider(context);
    registerHttpProvider(context);
    registerGitHubProvider(context);

    const pipelineBuilder = new PipelineBuilder(context.extensionUri);
    const pipelinesProvider = new PipelinesTreeDataProvider();
    const pipelinesView = vscode.window.createTreeView('intentRouterPipelines', {
        treeDataProvider: pipelinesProvider,
        dragAndDropController: pipelinesProvider,
        canSelectMany: false
    });

    const statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);
    const runtimeTriggerManager = new RuntimeTriggerManager(context);
    context.subscriptions.push(runtimeTriggerManager);
    void runtimeTriggerManager.start().catch((error) => {
        console.warn('[Intent Router] Runtime trigger manager failed to start:', error);
    });

    const chromeBridge = new ChromeBridge(context);
    context.subscriptions.push(chromeBridge);
    void chromeBridge.start().catch((error) => {
        console.warn('[Intent Router] Chrome bridge failed to start:', error);
    });

    const chromePanelView = new ChromePanelView(context.extensionUri, chromeBridge);
    context.subscriptions.push(chromePanelView);

    // Wire live tab updates from Chrome → WebView panel
    chromeBridge.onTabsUpdate((msg) => {
        chromePanelView.postMessage(msg);
    });

    let openChromeTabsDisposable = vscode.commands.registerCommand('intentRouter.openChromeTabs', () => {
        chromePanelView.open();
    });

    let disposable = vscode.commands.registerCommand('intentRouter.route', async (args: any) => {
        // Basic validation
        if (!args || typeof args.intent !== 'string') {
            vscode.window.showErrorMessage('Invalid intent format. Expected object with "intent" string property.');
            return;
        }

        const intent: Intent = {
            intent: args.intent,
            capabilities: args.capabilities,
            payload: args.payload,
            provider: args.provider,
            target: args.target,
            meta: args.meta
        };

        await routeIntent(intent);
    });

    let registerDisposable = vscode.commands.registerCommand('intentRouter.registerCapabilities', async (args: RegisterCapabilitiesArgs) => {
        const count = registerCapabilities(args);
        return count;
    });

	    let internalTerminalDisposable = vscode.commands.registerCommand('intentRouter.internal.terminalRun', async (args: any) => {
	        return await executeTerminalCommand(args);
	    });

	    let internalTerminalCancelDisposable = vscode.commands.registerCommand('intentRouter.internal.terminalCancel', async (args: any) => {
	        cancelTerminalRun(args?.runId);
	    });

        let aiGenerateDisposable = vscode.commands.registerCommand('intentRouter.internal.aiGenerate', async (args: any) => {
            return await executeAiCommand(args);
        });
        let aiTeamDisposable = vscode.commands.registerCommand('intentRouter.internal.aiTeam', async (args: any) => {
            return await executeAiTeamCommand(args);
        });

        let httpRequestDisposable = vscode.commands.registerCommand('intentRouter.internal.httpRequest', async (args: any) => {
            return await executeHttpCommand(args);
        });
        let githubOpenPrDisposable = vscode.commands.registerCommand('intentRouter.internal.githubOpenPr', async (args: any) => {
            return await executeGitHubOpenPr(args);
        });
        let githubPrChecksDisposable = vscode.commands.registerCommand('intentRouter.internal.githubPrChecks', async (args: any) => {
            return await executeGitHubPrChecks(args);
        });
        let githubPrRerunFailedChecksDisposable = vscode.commands.registerCommand('intentRouter.internal.githubPrRerunFailedChecks', async (args: any) => {
            return await executeGitHubPrRerunFailedChecks(args);
        });
        let githubPrCommentDisposable = vscode.commands.registerCommand('intentRouter.internal.githubPrComment', async (args: any) => {
            return await executeGitHubPrComment(args);
        });

    let promptDisposable = vscode.commands.registerCommand('intentRouter.routeFromJson', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Paste intent JSON to route',
            placeHolder: '{"intent":"deploy app","capabilities":["git.push"],"payload":{"project":"demo-app"}}'
        });

        if (!input) {
            return;
        }

        try {
            const args = JSON.parse(input);
            await vscode.commands.executeCommand('intentRouter.route', args);
        } catch (error) {
            vscode.window.showErrorMessage(`Invalid JSON: ${error}`);
        }
    });

    let createPipelineDisposable = vscode.commands.registerCommand('intentRouter.createPipeline', async () => {
        const uri = await createPipelineFileWithPrompt();
        if (uri) {
            pipelinesProvider.refresh();
        }
    });

    let runPipelineDisposable = vscode.commands.registerCommand('intentRouter.runPipeline', async () => {
        await runPipelineFromActiveEditor(false);
    });

    let dryRunPipelineDisposable = vscode.commands.registerCommand('intentRouter.dryRunPipeline', async () => {
        await runPipelineFromActiveEditor(true);
    });

    let runPipelineFromDataDisposable = vscode.commands.registerCommand('intentRouter.runPipelineFromData', async (pipeline, dryRun: boolean, startStepId?: string) => {
        await runPipelineFromData(pipeline, !!dryRun, startStepId);
    });

    let generatePromptDisposable = vscode.commands.registerCommand('intentRouter.generatePipelinePrompt', async () => {
        await generatePipelinePrompt();
    });

    let importFromClipboardDisposable = vscode.commands.registerCommand('intentRouter.importPipelineFromClipboard', async () => {
        await importPipelineFromClipboard();
        pipelinesProvider.refresh();
    });

    let openCodexDisposable = vscode.commands.registerCommand('intentRouter.openCodex', async () => {
        await openCodex();
    });

    let generatePromptAndOpenCodexDisposable = vscode.commands.registerCommand('intentRouter.generatePromptAndOpenCodex', async () => {
        const prompt = await generatePipelinePrompt();
        if (prompt) {
            await openCodex();
        }
    });

    let importPipelineFromClipboardAndRunDisposable = vscode.commands.registerCommand('intentRouter.importPipelineFromClipboardAndRun', async () => {
        const uri = await importPipelineFromClipboard();
        if (!uri) {
            return;
        }
        pipelinesProvider.refresh();
        await runPipelineFromUri(uri, false);
    });

    let internalCommitMessageDisposable = vscode.commands.registerCommand('intentRouter.internal.generateCommitMessage', async () => {
        return 'chore: publish';
    });

    let internalCreatePRDisposable = vscode.commands.registerCommand('intentRouter.internal.createPR', async () => {
        vscode.window.showInformationMessage('PR creation not implemented (demo composite).');
    });

    let newPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.new', async () => {
        await pipelineBuilder.open();
    });
    let loadSoftwareFactoryTemplateDisposable = vscode.commands.registerCommand('intentRouter.pipelines.loadSoftwareFactoryTemplate', async () => {
        await pipelineBuilder.open(createSoftwareFactoryPreset());
    });
    let loadSoftwareFactoryBranchTemplateDisposable = vscode.commands.registerCommand('intentRouter.pipelines.loadSoftwareFactoryBranchTemplate', async () => {
        await pipelineBuilder.open(createSoftwareFactoryBranchPreset());
    });

    let openPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.openBuilder', async (input?: vscode.Uri | PipelineTreeNode) => {
        const uri = input instanceof vscode.Uri ? input : (input?.kind === 'pipeline' ? input.item.uri : undefined);
        if (!uri) {
            return;
        }
        const pipeline = await readPipelineFromUri(uri);
        if (!pipeline) {
            return;
        }
        await pipelineBuilder.open(pipeline, uri);
    });

    let addClusterDisposable = vscode.commands.registerCommand('intentRouter.pipelines.addCluster', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Cluster name',
            placeHolder: 'backend, release, onboarding...'
        });
        if (!name) {
            return;
        }
        await pipelinesProvider.createCluster(name);
    });

    let renameClusterDisposable = vscode.commands.registerCommand('intentRouter.pipelines.renameCluster', async (node?: ClusterTreeNode) => {
        const clusterNode = node?.kind === 'cluster' ? node : getSelectedClusterNode(pipelinesView);
        if (!clusterNode || clusterNode.isUncategorized) {
            return;
        }
        const nextName = await vscode.window.showInputBox({
            prompt: 'Rename cluster',
            value: clusterNode.name
        });
        if (!nextName) {
            return;
        }
        await pipelinesProvider.renameCluster(clusterNode.id, nextName);
    });

    let deleteClusterDisposable = vscode.commands.registerCommand('intentRouter.pipelines.deleteCluster', async (node?: ClusterTreeNode) => {
        const clusterNode = node?.kind === 'cluster' ? node : getSelectedClusterNode(pipelinesView);
        if (!clusterNode || clusterNode.isUncategorized) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(
            `Delete cluster "${clusterNode.name}"? Pipelines will remain on disk.`,
            { modal: true },
            'Delete'
        );
        if (confirm !== 'Delete') {
            return;
        }
        await pipelinesProvider.deleteCluster(clusterNode.id);
    });

    let addPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.addPipeline', async (node?: ClusterTreeNode) => {
        const clusterNode = node?.kind === 'cluster' ? node : getSelectedClusterNode(pipelinesView);
        const uri = await createPipelineFileWithPrompt(clusterNode?.isUncategorized ? undefined : clusterNode?.name);
        if (!uri) {
            return;
        }
        if (clusterNode && !clusterNode.isUncategorized) {
            await pipelinesProvider.addPipelineUriToCluster(uri, clusterNode.id);
        } else {
            pipelinesProvider.refresh();
        }
    });

    let assignClusterDisposable = vscode.commands.registerCommand('intentRouter.pipelines.assignCluster', async (node?: PipelineTreeNode) => {
        const pipelineNode = node?.kind === 'pipeline' ? node : getSelectedPipelineNode(pipelinesView);
        if (!pipelineNode) {
            return;
        }
        const clusters = await pipelinesProvider.listClusters();
        const quickPickItems: Array<vscode.QuickPickItem & { clusterId: string | null }> = [
            ...clusters.map((cluster) => ({
                label: cluster.name,
                description: cluster.id,
                clusterId: cluster.id
            })),
            {
                label: '$(add) Create new cluster',
                description: '',
                clusterId: null
            }
        ];
        const picked = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Assign pipeline to cluster'
        });
        if (!picked) {
            return;
        }
        let clusterId = picked.clusterId;
        if (!clusterId) {
            const clusterName = await vscode.window.showInputBox({
                prompt: 'New cluster name'
            });
            if (!clusterName) {
                return;
            }
            const created = await pipelinesProvider.createCluster(clusterName);
            clusterId = created?.id ?? null;
        }
        if (!clusterId) {
            return;
        }
        await pipelinesProvider.addPipelineUriToCluster(pipelineNode.item.uri, clusterId);
    });

    let removeClusterDisposable = vscode.commands.registerCommand('intentRouter.pipelines.removeCluster', async (node?: PipelineTreeNode) => {
        const pipelineNode = node?.kind === 'pipeline' ? node : getSelectedPipelineNode(pipelinesView);
        if (!pipelineNode || pipelineNode.clusterId === '__uncategorized__') {
            return;
        }
        await pipelinesProvider.removePipelineFromCluster(pipelineNode.item.relativePath, pipelineNode.clusterId);
    });

    let renamePipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.rename', async (node?: PipelineTreeNode) => {
        const pipelineNode = node?.kind === 'pipeline' ? node : getSelectedPipelineNode(pipelinesView);
        if (!pipelineNode) {
            return;
        }
        const currentName = pipelineNode.item.uri.path.split('/').pop() || pipelineNode.item.relativePath;
        const nextNameRaw = await vscode.window.showInputBox({
            prompt: 'Rename pipeline file',
            value: currentName.replace('.intent.json', '')
        });
        if (!nextNameRaw) {
            return;
        }
        const nextFileName = nextNameRaw.endsWith('.intent.json') ? nextNameRaw : `${nextNameRaw}.intent.json`;
        const parent = pipelineNode.item.uri.with({ path: pipelineNode.item.uri.path.replace(/\/[^/]+$/, '') });
        const nextUri = vscode.Uri.joinPath(parent, nextFileName);
        if (await fileExists(nextUri)) {
            vscode.window.showErrorMessage(`Cannot rename: ${nextFileName} already exists.`);
            return;
        }
        await vscode.workspace.fs.rename(pipelineNode.item.uri, nextUri);
        await pipelinesProvider.syncPipelinePathAfterRename(pipelineNode.item.uri, nextUri);
    });

    let deletePipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.delete', async (node?: PipelineTreeNode) => {
        const pipelineNode = node?.kind === 'pipeline' ? node : getSelectedPipelineNode(pipelinesView);
        if (!pipelineNode) {
            return;
        }
        const fileName = pipelineNode.item.uri.path.split('/').pop() || pipelineNode.item.relativePath;
        const confirm = await vscode.window.showWarningMessage(
            `Delete pipeline "${fileName}"?`,
            { modal: true },
            'Delete'
        );
        if (confirm !== 'Delete') {
            return;
        }
        await vscode.workspace.fs.delete(pipelineNode.item.uri, { useTrash: true });
        await pipelinesProvider.removePipelineFromAllClusters(pipelineNode.item.uri);
    });

    let sortUpdatedDisposable = vscode.commands.registerCommand('intentRouter.pipelines.sortByUpdated', async () => {
        await pipelinesProvider.setSortMode('updated');
        vscode.window.showInformationMessage('Pipeline sort: updated date.');
    });

    let sortManualDisposable = vscode.commands.registerCommand('intentRouter.pipelines.sortManual', async () => {
        await pipelinesProvider.setSortMode('manual');
        vscode.window.showInformationMessage('Pipeline sort: manual.');
    });

    let runSelectedPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.run', async () => {
        const uri = await getPipelineUriFromSelectionOrPrompt(pipelinesView);
        if (!uri) {
            return;
        }
        await runPipelineFromUri(uri, false);
    });

    let dryRunSelectedPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.dryRun', async () => {
        const uri = await getPipelineUriFromSelectionOrPrompt(pipelinesView);
        if (!uri) {
            return;
        }
        await runPipelineFromUri(uri, true);
    });

    let openPipelineJsonDisposable = vscode.commands.registerCommand('intentRouter.pipelines.openJson', async () => {
        const uri = await getPipelineUriFromSelectionOrPrompt(pipelinesView);
        if (!uri) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    });

    let refreshPipelinesDisposable = vscode.commands.registerCommand('intentRouter.pipelines.refresh', async () => {
        pipelinesProvider.refresh();
    });
    let refreshRuntimeTriggersDisposable = vscode.commands.registerCommand('intentRouter.runtime.refreshTriggers', async () => {
        await runtimeTriggerManager.refresh();
        vscode.window.showInformationMessage('Runtime triggers refreshed.');
    });

    let showPipelineActionsDisposable = vscode.commands.registerCommand('intentRouter.showPipelineActions', async () => {
        const selection = await vscode.window.showQuickPick(['Pause Pipeline', 'Resume Pipeline', 'Cancel Pipeline'], {
            placeHolder: 'Select action for current pipeline'
        });
        if (selection === 'Pause Pipeline') {
             pauseCurrentPipeline();
        } else if (selection === 'Resume Pipeline') {
             resumeCurrentPipeline();
        } else if (selection === 'Cancel Pipeline') {
             cancelCurrentPipeline();
        }
    });

    let cancelPipelineDisposable = vscode.commands.registerCommand('intentRouter.cancelPipeline', async () => {
         cancelCurrentPipeline();
    });

    let pausePipelineDisposable = vscode.commands.registerCommand('intentRouter.pausePipeline', async () => {
         pauseCurrentPipeline();
    });

    let resumePipelineDisposable = vscode.commands.registerCommand('intentRouter.resumePipeline', async () => {
         resumeCurrentPipeline();
    });

    let clearHistoryDisposable = vscode.commands.registerCommand('intentRouter.clearHistory', async () => {
        await historyManager.clearHistory();
    });


    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('intentRouter.logLevel')) {
            invalidateLogLevelCache();
        }
    }));

	    context.subscriptions.push(disposable);
	    context.subscriptions.push(registerDisposable);
	    context.subscriptions.push(internalTerminalDisposable);
	    context.subscriptions.push(internalTerminalCancelDisposable);
        context.subscriptions.push(aiGenerateDisposable);
        context.subscriptions.push(aiTeamDisposable);
    context.subscriptions.push(httpRequestDisposable);
    context.subscriptions.push(githubOpenPrDisposable);
    context.subscriptions.push(githubPrChecksDisposable);
    context.subscriptions.push(githubPrRerunFailedChecksDisposable);
    context.subscriptions.push(githubPrCommentDisposable);
	    context.subscriptions.push(promptDisposable);
	    context.subscriptions.push(createPipelineDisposable);
	    context.subscriptions.push(runPipelineDisposable);
    context.subscriptions.push(dryRunPipelineDisposable);
    context.subscriptions.push(runPipelineFromDataDisposable);
    context.subscriptions.push(generatePromptDisposable);
    context.subscriptions.push(importFromClipboardDisposable);
    context.subscriptions.push(openCodexDisposable);
    context.subscriptions.push(generatePromptAndOpenCodexDisposable);
    context.subscriptions.push(importPipelineFromClipboardAndRunDisposable);
    context.subscriptions.push(internalCommitMessageDisposable);
    context.subscriptions.push(internalCreatePRDisposable);
    context.subscriptions.push(newPipelineDisposable);
    context.subscriptions.push(addPipelineDisposable);
    context.subscriptions.push(addClusterDisposable);
    context.subscriptions.push(renameClusterDisposable);
    context.subscriptions.push(deleteClusterDisposable);
    context.subscriptions.push(assignClusterDisposable);
    context.subscriptions.push(removeClusterDisposable);
    context.subscriptions.push(renamePipelineDisposable);
    context.subscriptions.push(deletePipelineDisposable);
    context.subscriptions.push(sortUpdatedDisposable);
    context.subscriptions.push(sortManualDisposable);
    context.subscriptions.push(loadSoftwareFactoryTemplateDisposable);
    context.subscriptions.push(loadSoftwareFactoryBranchTemplateDisposable);
    context.subscriptions.push(openPipelineDisposable);
    context.subscriptions.push(runSelectedPipelineDisposable);
    context.subscriptions.push(dryRunSelectedPipelineDisposable);
    context.subscriptions.push(openPipelineJsonDisposable);
    context.subscriptions.push(refreshPipelinesDisposable);
    context.subscriptions.push(refreshRuntimeTriggersDisposable);
    context.subscriptions.push(showPipelineActionsDisposable);
    context.subscriptions.push(cancelPipelineDisposable);
    context.subscriptions.push(pausePipelineDisposable);
    context.subscriptions.push(resumePipelineDisposable);
    context.subscriptions.push(clearHistoryDisposable);
    context.subscriptions.push(pipelinesProvider);
    context.subscriptions.push(pipelinesView);
    context.subscriptions.push(openChromeTabsDisposable);
}

export function deactivate() { }

async function getPipelineUriFromSelectionOrPrompt(
    pipelinesView: vscode.TreeView<PipelinesTreeNode>
): Promise<vscode.Uri | undefined> {
    const selected = getSelectedPipelineNode(pipelinesView);
    if (selected?.item?.uri instanceof vscode.Uri) {
        return selected.item.uri;
    }

    const files = await vscode.workspace.findFiles('pipeline/**/*.intent.json');
    if (files.length === 0) {
        vscode.window.showErrorMessage('No pipelines found in /pipeline.');
        return undefined;
    }

    const picks = files.map(uri => ({
        label: uri.path.split('/').pop() || 'pipeline',
        description: uri.path.split('/pipeline/')[1] || '',
        uri
    }));

    const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select a pipeline'
    });
    return picked?.uri;
}

function getSelectedPipelineNode(
    pipelinesView: vscode.TreeView<PipelinesTreeNode>
): PipelineTreeNode | undefined {
    const selected = pipelinesView.selection[0];
    if (selected?.kind === 'pipeline') {
        return selected;
    }
    return undefined;
}

function getSelectedClusterNode(
    pipelinesView: vscode.TreeView<PipelinesTreeNode>
): ClusterTreeNode | undefined {
    const selected = pipelinesView.selection[0];
    if (selected?.kind === 'cluster') {
        return selected;
    }
    return undefined;
}

async function createPipelineFileWithPrompt(defaultClusterName?: string): Promise<vscode.Uri | undefined> {
    const name = await vscode.window.showInputBox({
        prompt: 'Pipeline name (used for the file name)',
        placeHolder: 'deploy-app'
    });
    if (!name) {
        return undefined;
    }

    const profiles = vscode.workspace.getConfiguration('intentRouter').get<any[]>('profiles', []);
    const profileNames = Array.isArray(profiles)
        ? profiles.map(profile => profile?.name).filter((value: any) => typeof value === 'string')
        : [];

    const profile = await vscode.window.showQuickPick(
        ['(none)', ...profileNames],
        { placeHolder: 'Select a profile (optional)' }
    );
    if (!profile) {
        return undefined;
    }

    const fileName = name.endsWith('.intent.json') ? name : `${name}.intent.json`;
    const folder = await ensurePipelineFolder();
    if (!folder) {
        vscode.window.showErrorMessage('Open a workspace folder to create a pipeline file.');
        return undefined;
    }

    const normalizedCluster = String(defaultClusterName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    const defaultUri = normalizedCluster
        ? vscode.Uri.joinPath(folder, normalizedCluster, fileName)
        : vscode.Uri.joinPath(folder, fileName);
    const targetUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Intent Pipeline': ['intent.json'] }
    });
    if (!targetUri) {
        return undefined;
    }
    const parentUri = targetUri.with({ path: targetUri.path.replace(/\/[^/]+$/, '') });
    await vscode.workspace.fs.createDirectory(parentUri);

    const pipeline: any = {
        name,
        steps: []
    };
    if (profile !== '(none)') {
        pipeline.profile = profile;
    }

    await writePipelineToUri(targetUri, pipeline);
    const doc = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    return targetUri;
}

async function generatePipelinePrompt(): Promise<string | undefined> {
    const intent = await vscode.window.showInputBox({
        prompt: 'Décris le pipeline à générer',
        placeHolder: 'commit push sync build image deploy'
    });
    if (!intent) {
        return undefined;
    }

    const prompt = [
        'You are an intent pipeline compiler.',
        'Return ONLY valid JSON that matches this schema:',
        '{ "name": string, "profile"?: string, "steps": [{ "intent": string, "capabilities": string[], "payload"?: object }] }',
        'Rules:',
        '- JSON only, no markdown, no comments.',
        '- steps must be linear, ordered.',
        '- capabilities must be VS Code commands (ex: git.commit).',
        `Request: "${intent}"`
    ].join('\n');

    await vscode.env.clipboard.writeText(prompt);
    await openPromptPanel(prompt);
    vscode.window.showInformationMessage('Prompt copié dans le presse-papiers.');
    return prompt;
}

async function importPipelineFromClipboard(): Promise<vscode.Uri | undefined> {
    const text = await vscode.env.clipboard.readText();
    if (!text) {
        vscode.window.showErrorMessage('Presse-papiers vide.');
        return undefined;
    }

    let pipeline: { name?: string; steps?: any[]; profile?: string };
    try {
        pipeline = JSON.parse(text);
    } catch (error) {
        vscode.window.showErrorMessage(`JSON invalide dans le presse-papiers: ${error}`);
        return undefined;
    }

    if (!pipeline || !Array.isArray(pipeline.steps)) {
        vscode.window.showErrorMessage('Pipeline invalide: "steps" manquant.');
        return undefined;
    }

    let name = pipeline.name;
    if (!name) {
        name = await vscode.window.showInputBox({
            prompt: 'Nom du pipeline',
            placeHolder: 'deploy-app'
        });
    }
    if (!name) {
        return undefined;
    }

    const folder = await ensurePipelineFolder();
    if (!folder) {
        vscode.window.showErrorMessage('Ouvre un workspace pour créer /pipeline.');
        return undefined;
    }

    const fileName = name.endsWith('.intent.json') ? name : `${name}.intent.json`;
    const uri = vscode.Uri.joinPath(folder, fileName);
    const exists = await fileExists(uri);
    if (exists) {
        const confirm = await vscode.window.showWarningMessage(
            `Le fichier ${fileName} existe déjà. Écraser ?`,
            { modal: true },
            'Écraser'
        );
        if (confirm !== 'Écraser') {
            return undefined;
        }
    }

    await writePipelineToUri(uri, {
        name,
        profile: pipeline.profile,
        steps: pipeline.steps
    });

    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    return uri;
}

async function openCodex(): Promise<void> {
    const candidates = [
        'chatgpt.newCodexPanel',
        'chatgpt.newChat',
        'chatgpt.openCommandMenu'
    ];
    for (const cmd of candidates) {
        try {
            await vscode.commands.executeCommand(cmd);
            return;
        } catch {
            // ignore
        }
    }
    vscode.window.showErrorMessage('Impossible d’ouvrir Codex (chatgpt).');
}

async function openPromptPanel(prompt: string): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'intentRouter.promptPanel',
        'Pipeline Prompt',
        vscode.ViewColumn.Active,
        { enableScripts: true }
    );

    const nonce = generateSecureNonce();
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Prompt</title>
    <style>
        body { font-family: Segoe UI, sans-serif; margin: 0; padding: 16px; }
        textarea { width: 100%; height: 240px; font-family: Consolas, monospace; font-size: 12px; padding: 8px; }
        .actions { margin-top: 12px; display: flex; gap: 8px; }
    </style>
</head>
<body>
    <textarea readonly>${prompt.replace(/</g, '&lt;')}</textarea>
    <div class="actions">
        <button id="copy">Copy prompt</button>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('copy').addEventListener('click', () => {
            vscode.postMessage({ type: 'copyPrompt' });
        });
    </script>
</body>
</html>`;

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message?.type === 'copyPrompt') {
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage('Prompt copié.');
        }
    });
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

import * as vscode from 'vscode';
import { routeIntent, invalidateLogLevelCache } from './router';
import { Intent, RegisterCapabilitiesArgs } from './types';
import { registerCapabilities } from './registry';
import { PipelineBuilder } from './pipelineBuilder';
import { PipelinesTreeDataProvider } from './pipelinesView';
import { readPipelineFromUri, runPipelineFromActiveEditor, runPipelineFromData, runPipelineFromUri } from './pipelineRunner';

export function activate(context: vscode.ExtensionContext) {
    console.log('Intent Router extension is now active!');

    registerDemoProvider();
    const pipelineBuilder = new PipelineBuilder();
    const pipelinesProvider = new PipelinesTreeDataProvider();
    const pipelinesView = vscode.window.createTreeView('intentRouterPipelines', {
        treeDataProvider: pipelinesProvider
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
        const name = await vscode.window.showInputBox({
            prompt: 'Pipeline name (used for the file name)',
            placeHolder: 'deploy-app'
        });
        if (!name) {
            return;
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
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Open a workspace folder to create a pipeline file.');
            return;
        }

        const fileName = name.endsWith('.intent.json') ? name : `${name}.intent.json`;
        const defaultUri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
        const targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { 'Intent Pipeline': ['intent.json'] }
        });
        if (!targetUri) {
            return;
        }

        const pipeline: any = {
            name,
            steps: []
        };
        if (profile !== '(none)') {
            pipeline.profile = profile;
        }

        const content = JSON.stringify(pipeline, null, 2) + '\n';
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    });

    let runPipelineDisposable = vscode.commands.registerCommand('intentRouter.runPipeline', async () => {
        await runPipelineFromActiveEditor(false);
    });

    let dryRunPipelineDisposable = vscode.commands.registerCommand('intentRouter.dryRunPipeline', async () => {
        await runPipelineFromActiveEditor(true);
    });

    let runPipelineFromDataDisposable = vscode.commands.registerCommand('intentRouter.runPipelineFromData', async (pipeline, dryRun: boolean) => {
        await runPipelineFromData(pipeline, !!dryRun);
    });

    let newPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.new', async () => {
        await pipelineBuilder.open();
    });

    let openPipelineDisposable = vscode.commands.registerCommand('intentRouter.pipelines.openBuilder', async (uri?: vscode.Uri) => {
        if (!uri) {
            return;
        }
        const pipeline = await readPipelineFromUri(uri);
        if (!pipeline) {
            return;
        }
        await pipelineBuilder.open(pipeline, uri);
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

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('intentRouter.logLevel')) {
            invalidateLogLevelCache();
        }
    }));

    context.subscriptions.push(disposable);
    context.subscriptions.push(registerDisposable);
    context.subscriptions.push(promptDisposable);
    context.subscriptions.push(createPipelineDisposable);
    context.subscriptions.push(runPipelineDisposable);
    context.subscriptions.push(dryRunPipelineDisposable);
    context.subscriptions.push(runPipelineFromDataDisposable);
    context.subscriptions.push(newPipelineDisposable);
    context.subscriptions.push(openPipelineDisposable);
    context.subscriptions.push(runSelectedPipelineDisposable);
    context.subscriptions.push(dryRunSelectedPipelineDisposable);
    context.subscriptions.push(openPipelineJsonDisposable);
    context.subscriptions.push(refreshPipelinesDisposable);
    context.subscriptions.push(pipelinesView);
}

export function deactivate() { }

function registerDemoProvider(): void {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const demoProvider = config.get<string>('demoProvider', '');
    if (demoProvider !== 'git') {
        return;
    }

    registerCapabilities({
        provider: 'git',
        capabilities: [
            { capability: 'git.showOutput', command: 'git.showOutput' },
            { capability: 'git.fetch', command: 'git.fetch' },
            { capability: 'git.pull', command: 'git.pull' },
            { capability: 'git.push', command: 'git.push' }
        ]
    });
}

async function getPipelineUriFromSelectionOrPrompt(
    pipelinesView: vscode.TreeView<any>
): Promise<vscode.Uri | undefined> {
    const selected = pipelinesView.selection[0];
    if (selected?.uri instanceof vscode.Uri) {
        return selected.uri;
    }

    const files = await vscode.workspace.findFiles('pipeline/*.intent.json');
    if (files.length === 0) {
        vscode.window.showErrorMessage('No pipelines found in /pipeline.');
        return undefined;
    }

    const picks = files.map(uri => ({
        label: uri.path.split('/').pop() || 'pipeline',
        uri
    }));

    const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select a pipeline'
    });
    return picked?.uri;
}

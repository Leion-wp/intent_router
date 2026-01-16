import * as vscode from 'vscode';
import { routeIntent } from './router';
import { Intent, RegisterCapabilitiesArgs } from './types';
import { registerCapabilities } from './registry';

export function activate(context: vscode.ExtensionContext) {
    console.log('Intent Router extension is now active!');

    registerDemoProvider();

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
        await runPipeline(false);
    });

    let dryRunPipelineDisposable = vscode.commands.registerCommand('intentRouter.dryRunPipeline', async () => {
        await runPipeline(true);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(registerDisposable);
    context.subscriptions.push(promptDisposable);
    context.subscriptions.push(createPipelineDisposable);
    context.subscriptions.push(runPipelineDisposable);
    context.subscriptions.push(dryRunPipelineDisposable);
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

type PipelineFile = {
    name: string;
    profile?: string;
    steps: Array<Intent>;
};

async function runPipeline(dryRun: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Open a .intent.json file to run a pipeline.');
        return;
    }

    const doc = editor.document;
    const text = doc.getText();
    let pipeline: PipelineFile;
    try {
        pipeline = JSON.parse(text);
    } catch (error) {
        vscode.window.showErrorMessage(`Invalid pipeline JSON: ${error}`);
        return;
    }

    if (!pipeline || !Array.isArray(pipeline.steps)) {
        vscode.window.showErrorMessage('Invalid pipeline: expected a "steps" array.');
        return;
    }

    const config = vscode.workspace.getConfiguration('intentRouter');
    const originalProfile = config.get<string>('activeProfile', '');
    const targetProfile = pipeline.profile ?? '';
    if (targetProfile && targetProfile !== originalProfile) {
        await config.update('activeProfile', targetProfile, true);
    }

    try {
        for (const step of pipeline.steps) {
            const stepIntent: Intent = {
                ...step,
                meta: {
                    ...(step.meta ?? {}),
                    dryRun: dryRun ? true : step.meta?.dryRun
                }
            };

            const ok = await routeIntent(stepIntent);
            if (!ok) {
                vscode.window.showWarningMessage('Pipeline stopped on failed step.');
                break;
            }
        }
    } finally {
        if (targetProfile && targetProfile !== originalProfile) {
            await config.update('activeProfile', originalProfile, true);
        }
    }
}

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

    context.subscriptions.push(disposable);
    context.subscriptions.push(registerDisposable);
    context.subscriptions.push(promptDisposable);
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

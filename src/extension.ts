import * as vscode from 'vscode';
import { routeIntent } from './router';
import { Intent, RegisterCapabilitiesArgs } from './types';
import { registerCapabilities } from './registry';

export function activate(context: vscode.ExtensionContext) {
    console.log('Intent Router extension is now active!');

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

    context.subscriptions.push(disposable);
    context.subscriptions.push(registerDisposable);
}

export function deactivate() { }

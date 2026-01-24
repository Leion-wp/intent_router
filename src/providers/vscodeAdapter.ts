import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerVSCodeProvider(context: vscode.ExtensionContext) {
    // Register internal command to install extensions
    const internalInstallExtensions = vscode.commands.registerCommand('intentRouter.internal.installExtensions', async (payload: any) => {
        await installExtensions(payload);
    });
    context.subscriptions.push(internalInstallExtensions);

    registerCapabilities({
        provider: 'vscode',
        type: 'vscode',
        capabilities: [
            {
                capability: 'vscode.installExtensions',
                command: 'intentRouter.internal.installExtensions',
                description: 'Install a list of VS Code extensions',
                args: [
                    { name: 'extensions', type: 'string', description: 'Extension IDs (one per line)', required: true }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered VS Code provider capabilities.');
}

export async function installExtensions(payload: any): Promise<void> {
    const rawExtensions = payload?.extensions;
    if (!rawExtensions) {
        vscode.window.showErrorMessage('No extensions provided to install.');
        return;
    }

    let extensions: string[] = [];
    if (Array.isArray(rawExtensions)) {
        extensions = rawExtensions.filter(s => typeof s === 'string');
    } else if (typeof rawExtensions === 'string') {
        extensions = rawExtensions.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
         vscode.window.showErrorMessage('Invalid format for extensions. Expected string (multiline) or string array.');
         return;
    }

    if (extensions.length === 0) {
         vscode.window.showWarningMessage('No valid extension IDs found to install.');
         return;
    }

    vscode.window.showInformationMessage(`Installing ${extensions.length} extensions...`);

    const errors: string[] = [];
    for (const id of extensions) {
        try {
            console.log(`[Intent Router] Installing extension: ${id}`);
            await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
        } catch (error: any) {
            const msg = `Failed to install ${id}: ${error?.message || error}`;
            console.error(`[Intent Router] ${msg}`);
            errors.push(msg);
        }
    }

    if (errors.length > 0) {
        if (errors.length === extensions.length) {
             vscode.window.showErrorMessage(`All extensions failed to install. Check console for details.`);
        } else {
             vscode.window.showWarningMessage(`${errors.length} extensions failed to install. Check console for details.`);
        }
    } else {
        vscode.window.showInformationMessage(`Successfully installed ${extensions.length} extensions.`);
    }
}

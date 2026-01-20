import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerSystemProvider(context: vscode.ExtensionContext) {
    doRegister();
}

function doRegister() {
    registerCapabilities({
        provider: 'system',
        type: 'vscode',
        capabilities: [
            {
                capability: 'system.pause',
                command: 'intentRouter.internal.systemPause'
            }
        ]
    });
    console.log('[Intent Router] Registered System provider capabilities.');
}

export const systemTemplates: Record<string, any> = {
    'system.pause': { "message": "Verify results then continue." }
};

export async function executeSystemPause(args: any): Promise<void> {
    const message = args?.message || 'Pipeline paused. Continue?';

    const selection = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Continue',
        'Stop'
    );

    if (selection !== 'Continue') {
        throw new Error('Pipeline stopped by user.');
    }
}

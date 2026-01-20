import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerGitProvider(context: vscode.ExtensionContext) {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        return; // Strict discovery: if not present, do not register.
    }

    if (!gitExtension.isActive) {
        // Try to activate if present but not active, though usually Git activates early.
        gitExtension.activate().then(() => doRegister(), () => {});
    } else {
        doRegister();
    }
}

function doRegister() {
    registerCapabilities({
        provider: 'git',
        type: 'vscode',
        capabilities: [
            {
                capability: 'git.commit',
                command: 'git.commit',
                mapPayload: (intent) => intent.payload?.message ? { message: intent.payload.message } : undefined
            },
            {
                capability: 'git.push',
                command: 'git.push'
            },
            {
                capability: 'git.pull',
                command: 'git.pull'
            }
        ]
    });
    console.log('[Intent Router] Registered Git provider capabilities.');
}

export const gitTemplates: Record<string, any> = {
    'git.commit': { "message": "chore: update" },
    'git.push': {},
    'git.pull': {}
};

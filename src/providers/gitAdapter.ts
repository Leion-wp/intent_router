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
                description: 'Commit changes to the local repository',
                args: [
                    { name: 'message', type: 'string', description: 'Commit message', required: true },
                    { name: 'amend', type: 'boolean', description: 'Amend previous commit', default: false }
                ],
                mapPayload: (intent) => intent.payload?.message ? { message: intent.payload.message } : undefined
            },
            {
                capability: 'git.push',
                command: 'git.push',
                description: 'Push changes to remote repository',
                args: [
                    // git.push in VS Code usually doesn't take arguments via command, but we can support remote/branch later
                ]
            },
            {
                capability: 'git.pull',
                command: 'git.pull',
                description: 'Pull changes from remote repository',
                args: []
            },
            {
                capability: 'git.checkout',
                command: 'git.checkout',
                description: 'Checkout a branch or tag',
                args: [
                     { name: 'branch', type: 'string', description: 'Branch name to checkout', required: true },
                     { name: 'create', type: 'boolean', description: 'Create new branch', default: false }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered Git provider capabilities.');
}

export const gitTemplates: Record<string, any> = {
    'git.commit': { "message": "chore: update", "amend": false },
    'git.push': {},
    'git.pull': {},
    'git.checkout': { "branch": "main", "create": false }
};

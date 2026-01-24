import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerGitProvider(context: vscode.ExtensionContext) {
    // V2 direction: Git steps compile to terminal commands in the runner.
    // We still register schemas/templates for the builder and keep VS Code commands as a fallback for direct routing.
    doRegister();
}

function doRegister() {
    registerCapabilities({
        provider: 'git',
        type: 'vscode',
        capabilities: [
            {
                capability: 'git.clone',
                command: 'git.clone',
                description: 'Clone a repository',
                args: [
                    { name: 'url', type: 'string', description: 'Repository URL', required: true },
                    { name: 'dir', type: 'path', description: 'Target directory (optional)' }
                ]
            },
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
    'git.clone': { "url": "https://github.com/org/repo.git", "dir": "." },
    'git.commit': { "message": "chore: update", "amend": false },
    'git.push': {},
    'git.pull': {},
    'git.checkout': { "branch": "main", "create": false }
};

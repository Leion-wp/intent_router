import * as vscode from 'vscode';
import * as path from 'path';
import { registerCapabilities } from '../registry';
import { validateCwdString } from '../security';

export function registerTerminalProvider(context: vscode.ExtensionContext) {
    // Terminal is a built-in feature, so we always register it.
    doRegister();
}

function doRegister() {
    registerCapabilities({
        provider: 'terminal',
        type: 'vscode',
        capabilities: [
            {
                capability: 'terminal.run',
                command: 'intentRouter.internal.terminalRun',
                description: 'Run a shell command in the integrated terminal',
                args: [
                    { name: 'command', type: 'string', description: 'The shell command to execute', required: true },
                    { name: 'cwd', type: 'path', description: 'Working directory', default: '.' }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered Terminal provider capabilities.');
}

export const terminalTemplates: Record<string, any> = {
    'terminal.run': { "command": "echo 'Hello Intent Router'", "cwd": "." }
};

async function validateCwdPath(cwd: string): Promise<void> {
    validateCwdString(cwd);

    let uri: vscode.Uri;
    if (path.isAbsolute(cwd)) {
        uri = vscode.Uri.file(cwd);
    } else {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, cwd);
        } else {
            // Cannot reliably validate relative path existence without workspace context.
            // Rely on string validation only.
            return;
        }
    }

    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        throw new Error(`Security Error: cwd path does not exist or is inaccessible: ${cwd}`);
    }
}

export async function executeTerminalCommand(args: any): Promise<void> {
    const commandText = args?.command;
    const cwd = args?.cwd;

    if (!commandText || typeof commandText !== 'string') {
        vscode.window.showErrorMessage('Invalid terminal command payload. Expected "command" string.');
        return;
    }

    const TERMINAL_NAME = 'Intent Router';
    let term = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);

    if (!term) {
        term = vscode.window.createTerminal(TERMINAL_NAME);
    }

    term.show();

    // Avoid shell-specific chaining tokens (PowerShell 5.1 doesn't support `&&`).
    // `pushd` works across PowerShell/cmd/bash/zsh and also switches drives on Windows.
    if (typeof cwd === 'string' && cwd.trim() && cwd.trim() !== '.') {
        try {
            await validateCwdPath(cwd.trim());
            term.sendText(`pushd "${cwd.trim()}"`);
        } catch (error: any) {
             vscode.window.showErrorMessage(error.message);
             return;
        }
    }

    term.sendText(commandText);
}

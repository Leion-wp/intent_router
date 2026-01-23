import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

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

    let finalCommand = commandText;
    if (args.cwd && args.cwd !== '.') {
        // Prepend cd command. Quote path to handle spaces.
        // This assumes bash/zsh/powershell syntax compatibility for '&&' or ';'.
        // VS Code terminals usually default to the platform shell.
        // For broad compatibility, 'cd "path" && command' is standard on *nix.
        // On Windows Powershell, 'cd "path"; command' or 'cd "path" && command' (PS 7+) works.
        // Since the user asked for "command && cwd" fix (implying chaining), we use &&.
        finalCommand = `cd "${args.cwd}" && ${commandText}`;
    }

    term.sendText(finalCommand);
}

import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

const TERMINAL_NAME = 'Intent Router';

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
                command: 'intentRouter.internal.terminalRun'
            }
        ]
    });
    console.log('[Intent Router] Registered Terminal provider capabilities.');
}

export const terminalTemplates: Record<string, any> = {
    'terminal.run': { "command": "echo 'Hello Intent Router'" }
};

export async function executeTerminalCommand(args: any): Promise<void> {
    const commandText = args?.command;
    if (!commandText || typeof commandText !== 'string') {
        vscode.window.showErrorMessage('Invalid terminal command payload. Expected "command" string.');
        return;
    }

    let term = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
    if (!term) {
        term = vscode.window.createTerminal(TERMINAL_NAME);
    }

    term.show();
    term.sendText(commandText);
}

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { pipelineEventBus } from '../eventBus';
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

let sharedPtyWriteEmitter: vscode.EventEmitter<string> | undefined;
let sharedTerminal: vscode.Terminal | undefined;

function getOrCreateTerminal(): { terminal: vscode.Terminal, write: (data: string) => void } {
    if (!sharedTerminal) {
        sharedPtyWriteEmitter = new vscode.EventEmitter<string>();
        const pty: vscode.Pseudoterminal = {
            onDidWrite: sharedPtyWriteEmitter.event,
            open: () => {
                sharedPtyWriteEmitter?.fire('Intent Router Terminal Active\r\n');
            },
            close: () => {
                sharedTerminal = undefined;
                sharedPtyWriteEmitter = undefined;
            }
        };
        sharedTerminal = vscode.window.createTerminal({ name: 'Intent Router (Live)', pty });
    }

    return {
        terminal: sharedTerminal,
        write: (data: string) => {
             if (sharedPtyWriteEmitter) {
                 // Normalize to CRLF for terminal display
                 sharedPtyWriteEmitter.fire(data.replace(/\r?\n/g, '\r\n'));
             }
        }
    };
}

export async function executeTerminalCommand(args: any): Promise<void> {
    const commandText = args?.command;
    const cwd = args?.cwd;
    const meta = args?.__meta;

    if (!commandText || typeof commandText !== 'string') {
        vscode.window.showErrorMessage('Invalid terminal command payload. Expected "command" string.');
        return;
    }

    // Capture mode (Pipeline)
    if (meta && meta.traceId && meta.runId) {
        return runCommand(commandText, cwd, meta.runId, meta.traceId);
    }

    // Legacy mode (Interactive / Fire-and-forget)
    const TERMINAL_NAME = 'Intent Router';
    let term = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);

    if (!term) {
        term = vscode.window.createTerminal(TERMINAL_NAME);
    }

    term.show();

    // Avoid shell-specific chaining tokens (PowerShell 5.1 doesn't support `&&`).
    // `pushd` works across PowerShell/cmd/bash/zsh and also switches drives on Windows.
    if (typeof cwd === 'string' && cwd.trim() && cwd.trim() !== '.') {
        term.sendText(`pushd "${cwd.trim()}"`);
    }

    term.sendText(commandText);
}

function runCommand(command: string, cwd: string, runId: string, intentId: string): Promise<void> {
    const { terminal, write } = getOrCreateTerminal();
    terminal.show(true);

    write(`\x1b[36m> Executing: ${command}\x1b[0m\n`);

    return new Promise((resolve, reject) => {
        const child = cp.spawn(command, {
            cwd: (cwd && cwd.trim() !== '') ? cwd : undefined,
            shell: true
        });

        child.stdout.on('data', (data) => {
            const text = data.toString();
            write(text);
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                text,
                stream: 'stdout'
            });
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            write(`\x1b[31m${text}\x1b[0m`);
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                text,
                stream: 'stderr'
            });
        });

        child.on('close', (code) => {
             if (code === 0) {
                 resolve();
             } else {
                 reject(new Error(`Command failed with exit code ${code}`));
             }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

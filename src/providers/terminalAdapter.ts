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

const runningProcessesByRunId = new Map<string, Set<cp.ChildProcess>>();

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
    const env = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};

    if (term) {
        // Check if environment matches
        const currentEnv = (term.creationOptions as vscode.TerminalOptions).env || {};
        if (!isEnvEqual(env, currentEnv as Record<string, string>)) {
            term.dispose();
            term = undefined;
        }
    }

    if (!term) {
        term = vscode.window.createTerminal({ name: TERMINAL_NAME, env });
    }

    term.show();

    // Avoid shell-specific chaining tokens (PowerShell 5.1 doesn't support `&&`).
    // `pushd` works across PowerShell/cmd/bash/zsh and also switches drives on Windows.
    if (typeof cwd === 'string' && cwd.trim() && cwd.trim() !== '.') {
        term.sendText(`pushd "${cwd.trim()}"`);
    }

    term.sendText(commandText);
}

function isEnvEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a || {});
    const keysB = Object.keys(b || {});
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (const key of keysA) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

async function runCommand(command: string, cwd: string, runId: string, traceId: string): Promise<void> {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['-Command', command] : ['-c', command];

    const config = vscode.workspace.getConfiguration('intentRouter');
    const configEnv = config.get<Record<string, string>>('environment') || {};
    const env = { ...process.env, ...configEnv };

    return new Promise((resolve, reject) => {
        const child = cp.spawn(shell, shellArgs, {
            cwd: cwd || undefined,
            env,
            shell: false
        });

        if (!runningProcessesByRunId.has(runId)) {
            runningProcessesByRunId.set(runId, new Set());
        }
        runningProcessesByRunId.get(runId)?.add(child);

        child.stdout.on('data', (data) => {
             const msg = data.toString();
             getOrCreateTerminal().write(msg);
             pipelineEventBus.emit({
                 type: 'stepLog',
                 runId,
                 intentId: traceId,
                 text: msg,
                 stream: 'stdout'
             });
        });

        child.stderr.on('data', (data) => {
             const msg = data.toString();
             getOrCreateTerminal().write(msg);
              pipelineEventBus.emit({
                 type: 'stepLog',
                 runId,
                 intentId: traceId,
                 text: msg,
                 stream: 'stderr'
             });
        });

        child.on('error', (err) => {
             runningProcessesByRunId.get(runId)?.delete(child);
             reject(err);
        });

        child.on('close', (code) => {
             runningProcessesByRunId.get(runId)?.delete(child);
             if (code === 0) {
                 resolve();
             } else {
                 reject(new Error(`Command exited with code ${code}`));
             }
        });
    });
}

export function cancelTerminalRun(runId: string) {
    const processes = runningProcessesByRunId.get(runId);
    if (processes) {
        for (const proc of processes) {
            proc.kill(); // default SIGTERM
        }
        runningProcessesByRunId.delete(runId);
    }
}

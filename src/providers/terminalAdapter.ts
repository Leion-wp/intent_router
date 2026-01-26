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

export function cancelTerminalRun(runId: string | undefined | null): void {
    if (!runId) {
        return;
    }

    const processes = runningProcessesByRunId.get(runId);
    if (!processes || processes.size === 0) {
        return;
    }

    for (const child of processes) {
        if (!child.pid) {
            continue;
        }

        try {
            if (process.platform === 'win32') {
                cp.spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
                child.kill('SIGTERM');
            }
        } catch {
            // Best-effort cancellation.
        }
    }
}

function runCommand(command: string, cwd: string | undefined, runId: string, intentId: string): Promise<void> {
    const { terminal, write } = getOrCreateTerminal();
    terminal.show(true);

    write(`\x1b[36m> Executing: ${command}\x1b[0m\n`);

    return new Promise((resolve, reject) => {
        const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
        const env = { ...process.env, ...envOverrides };
        const safeCwd = (typeof cwd === 'string' && cwd.trim() !== '') ? cwd : undefined;

        const child = (process.platform === 'win32')
            ? cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { cwd: safeCwd, env })
            : cp.spawn(command, { cwd: safeCwd, env, shell: true });

        const running = runningProcessesByRunId.get(runId) ?? new Set<cp.ChildProcess>();
        running.add(child);
        runningProcessesByRunId.set(runId, running);

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

        const cleanup = () => {
            const active = runningProcessesByRunId.get(runId);
            if (!active) {
                return;
            }
            active.delete(child);
            if (active.size === 0) {
                runningProcessesByRunId.delete(runId);
            }
        };

        child.on('close', (code) => {
            cleanup();
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on('error', (err) => {
            cleanup();
            reject(err);
        });
    });
}

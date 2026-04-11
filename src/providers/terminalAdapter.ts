import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { validateSafeRelativePath } from '../security';

type WindowsShellConfig = {
    executable: string;
    interactiveArgs: string[];
    commandArgs: string[];
};

const TERMINAL_NAME = 'Intent Router';
let platformOverride: NodeJS.Platform | undefined;

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
                determinism: 'deterministic',
                args: [
                    { name: 'command', type: 'string', description: 'The shell command to execute', required: true },
                    { name: 'cwd', type: 'path', description: 'Working directory', default: '.' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store captured stdout' }
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

function getRuntimePlatform(): NodeJS.Platform {
    return platformOverride || process.platform;
}

export async function executeTerminalCommand(args: any): Promise<any> {
    const commandText = args?.command;
    const cwd = normalizeExecutionCwd(args?.cwd);
    const meta = args?.__meta;

    if (!commandText || typeof commandText !== 'string') {
        vscode.window.showErrorMessage('Invalid terminal command payload. Expected "command" string.');
        return;
    }

    // Capture mode (Pipeline)
    if (meta && meta.traceId && meta.runId) {
        return runCommand(commandText, cwd, meta.runId, meta.traceId, meta.stepId);
    }

    // Legacy mode (Interactive / Fire-and-forget)
    let term = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
    const env = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
    const terminalOptions = buildInteractiveTerminalOptions(TERMINAL_NAME, env);

    if (term && shouldRecreateInteractiveTerminal(term, terminalOptions, env)) {
        term.dispose();
        term = undefined;
    }

    if (!term) {
        term = vscode.window.createTerminal(terminalOptions);
    }

    term.show();

    if (typeof cwd === 'string' && cwd.trim() && cwd.trim() !== '.') {
        const trustedRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || path.resolve('.');
        try {
            validateSafeRelativePath(cwd, trustedRoot);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Security Error: ${e.message}`);
            return;
        }
        sendTerminalCwd(term, cwd.trim());
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

function normalizeExecutionCwd(rawCwd: any): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || path.resolve('.');
    const raw = typeof rawCwd === 'string' ? rawCwd.trim() : '';

    if (!raw || raw === '.' || raw === '${workspaceRoot}') {
        return workspaceRoot;
    }

    if (raw.startsWith('${workspaceRoot}')) {
        const suffix = raw.slice('${workspaceRoot}'.length).trim().replace(/^[/\\]+/, '');
        return suffix ? path.resolve(workspaceRoot, suffix) : workspaceRoot;
    }

    if (path.isAbsolute(raw)) {
        return raw;
    }

    return path.resolve(workspaceRoot, raw);
}

function buildInteractiveTerminalOptions(
    name: string,
    env: Record<string, string>,
    platform: NodeJS.Platform = getRuntimePlatform()
): vscode.TerminalOptions {
    if (platform !== 'win32') {
        return { name, env };
    }

    const shell = resolveWindowsShellConfig();
    return {
        name,
        env,
        shellPath: shell.executable,
        shellArgs: shell.interactiveArgs
    };
}

function shouldRecreateInteractiveTerminal(
    terminal: vscode.Terminal,
    expectedOptions: vscode.TerminalOptions,
    env: Record<string, string>
): boolean {
    const currentOptions = (terminal.creationOptions as vscode.TerminalOptions) || {};
    const currentEnv = (currentOptions.env || {}) as Record<string, string>;

    if (!isEnvEqual(env, currentEnv)) {
        return true;
    }

    if (getRuntimePlatform() !== 'win32') {
        return false;
    }

    const currentShellPath = String(currentOptions.shellPath || '').trim().toLowerCase();
    const expectedShellPath = String(expectedOptions.shellPath || '').trim().toLowerCase();
    if (currentShellPath !== expectedShellPath) {
        return true;
    }

    return normalizeShellArgs(currentOptions.shellArgs) !== normalizeShellArgs(expectedOptions.shellArgs);
}

function normalizeShellArgs(args: string[] | string | undefined): string {
    if (Array.isArray(args)) {
        return args.join('\u0000');
    }
    return typeof args === 'string' ? args : '';
}

function sendTerminalCwd(term: vscode.Terminal, cwd: string): void {
    if (getRuntimePlatform() === 'win32') {
        term.sendText(`Set-Location -LiteralPath ${quotePowerShellLiteral(cwd)}`);
        return;
    }

    term.sendText(`pushd "${cwd.replace(/"/g, '\\"')}"`);
}

function quotePowerShellLiteral(value: string): string {
    return `'${String(value || '').replace(/'/g, "''")}'`;
}

function resolveWindowsShellConfig(): WindowsShellConfig {
    const executable = resolveWindowsPowerShellExecutable();
    const lowerBase = path.basename(executable).toLowerCase();
    const isPwsh = lowerBase === 'pwsh.exe' || lowerBase === 'pwsh';

    return {
        executable,
        interactiveArgs: ['-NoLogo'],
        commandArgs: isPwsh
            ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']
            : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-EncodedCommand']
    };
}

function buildWindowsCommandScript(command: string): string {
    return [
        "$ProgressPreference = 'SilentlyContinue'",
        "$InformationPreference = 'Continue'",
        command
    ].join(';\r\n');
}

function sanitizeCapturedOutput(text: string, platform: NodeJS.Platform = getRuntimePlatform()): string {
    if (platform !== 'win32' || !text) {
        return text;
    }

    return text
        .replace(/#< CLIXML\r?\n?/g, '')
        .replace(/<Objs Version="1\.1\.0\.1" xmlns="http:\/\/schemas\.microsoft\.com\/powershell\/2004\/04">[\s\S]*?<\/Objs>/g, '')
        .replace(/^(?:\r?\n)+/, '')
        .replace(/(?:\r?\n){3,}/g, '\n\n');
}

function resolveWindowsPowerShellExecutable(): string {
    const candidates: string[] = [];
    const programFilesRoots = [
        process.env.ProgramW6432,
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)']
    ];

    for (const root of programFilesRoots) {
        if (!root) {
            continue;
        }
        candidates.push(path.join(root, 'PowerShell', '7', 'pwsh.exe'));
        candidates.push(path.join(root, 'PowerShell', '7-preview', 'pwsh.exe'));
    }

    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    if (systemRoot) {
        candidates.push(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
    }

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return 'powershell.exe';
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
            if (getRuntimePlatform() === 'win32') {
                cp.spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
                child.kill('SIGTERM');
            }
        } catch {
            // Best-effort cancellation.
        }
    }
}

function runCommand(command: string, cwd: string | undefined, runId: string, intentId: string, stepId?: string): Promise<{ content: string; stdout: string; stderr: string; exitCode: number }> {
    const { terminal, write } = getOrCreateTerminal();
    terminal.show(true);

    write(`\x1b[36m> Executing: ${command}\x1b[0m\n`);

    return new Promise((resolve, reject) => {
        const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
        const env = { ...process.env, ...envOverrides };
        const safeCwd = (typeof cwd === 'string' && cwd.trim() !== '') ? cwd : undefined;
        let stdoutBuffer = '';
        let stderrBuffer = '';

        if (safeCwd) {
            const trustedRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || path.resolve('.');
            try {
                validateSafeRelativePath(safeCwd, trustedRoot);
            } catch (error: any) {
                write(`\x1b[31mSecurity Error: ${error.message}\x1b[0m\n`);
                return reject(error);
            }
        }

        const child = spawnCapturedCommand(command, safeCwd, env);

        const running = runningProcessesByRunId.get(runId) ?? new Set<cp.ChildProcess>();
        running.add(child);
        runningProcessesByRunId.set(runId, running);

        child.stdout?.on('data', (data) => {
            const text = sanitizeCapturedOutput(data.toString());
            if (!text) {
                return;
            }
            stdoutBuffer += text;
            write(text);
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                stepId,
                text,
                stream: 'stdout'
            });
        });

        child.stderr?.on('data', (data) => {
            const text = sanitizeCapturedOutput(data.toString());
            if (!text) {
                return;
            }
            stderrBuffer += text;
            write(`\x1b[31m${text}\x1b[0m`);
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                stepId,
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
                resolve({
                    content: stdoutBuffer.trim(),
                    stdout: stdoutBuffer,
                    stderr: stderrBuffer,
                    exitCode: 0
                });
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

function spawnCapturedCommand(command: string, cwd: string | undefined, env: NodeJS.ProcessEnv): cp.ChildProcess {
    if (getRuntimePlatform() === 'win32') {
        const shell = resolveWindowsShellConfig();
        const encodedCommand = Buffer.from(buildWindowsCommandScript(command), 'utf16le').toString('base64');
        return cp.spawn(shell.executable, [...shell.commandArgs, encodedCommand], {
            cwd,
            env,
            windowsHide: true
        });
    }

    return cp.spawn(command, { cwd, env, shell: true });
}

export const __test = {
    buildInteractiveTerminalOptions,
    resolveWindowsPowerShellExecutable,
    resolveWindowsShellConfig,
    buildWindowsCommandScript,
    sanitizeCapturedOutput,
    getWindowsPowerShellExecutable: resolveWindowsPowerShellExecutable,
    setPlatformOverride: (platform: NodeJS.Platform | undefined) => {
        platformOverride = platform;
    }
};

import * as vscode from 'vscode';
import { Intent, Resolution, UserMapping } from './types';
import { resolveCapabilities } from './registry';

export async function routeIntent(intent: Intent) {
    const normalized = normalizeIntent(intent);
    const output = getOutputChannel();
    const userMappings = getUserMappings();

    log(output, normalized, `step=normalize intent=${normalized.intent}`);

    const resolved = resolveCapabilities(normalized, userMappings);
    log(output, normalized, `step=resolve count=${resolved.length}`);

    if (resolved.length === 0) {
        vscode.window.showWarningMessage(`No capabilities resolved for intent: ${normalized.intent}`);
        return;
    }

    const filtered = filterByProviderTarget(normalized, resolved);
    log(output, normalized, `step=filter count=${filtered.length}`);

    if (filtered.length === 0) {
        vscode.window.showWarningMessage(`No capabilities matched provider/target for intent: ${normalized.intent}`);
        return;
    }

    for (const entry of filtered) {
        await executeResolution(normalized, entry, output);
    }
}

function getUserMappings(): UserMapping[] {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const rawMappings = config.get<UserMapping[]>('mappings', []);

    if (!Array.isArray(rawMappings)) {
        return [];
    }

    return rawMappings.filter(m => !!m && typeof m.capability === 'string' && typeof m.command === 'string');
}

function normalizeIntent(intent: Intent): Intent {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const debugDefault = config.get<boolean>('debug', false);

    const meta = {
        dryRun: intent.meta?.dryRun ?? false,
        traceId: intent.meta?.traceId ?? generateTraceId(),
        debug: intent.meta?.debug ?? debugDefault
    };

    return {
        ...intent,
        meta
    };
}

function filterByProviderTarget(intent: Intent, entries: Resolution[]): Resolution[] {
    if (!intent.provider && !intent.target) {
        return entries;
    }

    return entries.filter(entry => {
        if (intent.provider && entry.provider !== intent.provider) {
            return false;
        }
        if (intent.target && entry.target !== intent.target) {
            return false;
        }
        return true;
    });
}

async function executeResolution(intent: Intent, entry: Resolution, output: vscode.OutputChannel): Promise<void> {
    const meta = intent.meta ?? {};

    if (entry.type !== 'vscode') {
        log(output, intent, `step=transport skip type=${entry.type} capability=${entry.capability}`);
        return;
    }

    const payload = entry.mapPayload ? entry.mapPayload(intent) : intent.payload;
    log(output, intent, `step=execute command=${entry.command} source=${entry.source} dryRun=${meta.dryRun ? 'true' : 'false'}`);

    if (meta.dryRun) {
        return;
    }

    try {
        await vscode.commands.executeCommand(entry.command, payload);
    } catch (error) {
        log(output, intent, `step=execute error command=${entry.command}`);
        console.error(`Failed to execute capability ${entry.command}:`, error);
        vscode.window.showErrorMessage(`Failed to execute ${entry.command}: ${error}`);
    }
}

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Intent Router');
    }
    return outputChannel;
}

function log(output: vscode.OutputChannel, intent: Intent, message: string): void {
    const traceId = intent.meta?.traceId ?? 'unknown';
    output.appendLine(`[${traceId}] ${message}`);
    if (intent.meta?.debug) {
        console.log(`[${traceId}] ${message}`);
    }
}

function generateTraceId(): string {
    const rand = Math.floor(Math.random() * 1e8).toString(16);
    return `${Date.now().toString(16)}-${rand}`;
}

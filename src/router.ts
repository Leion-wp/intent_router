import * as vscode from 'vscode';
import { Intent, ProfileConfig, ProviderAdapter, Resolution, UserMapping } from './types';
import { resolveCapabilities } from './registry';

let cachedLogLevel: 'error' | 'warn' | 'info' | 'debug' | undefined;

export function invalidateLogLevelCache(): void {
    cachedLogLevel = undefined;
}

export async function routeIntent(intent: Intent): Promise<boolean> {
    const normalized = normalizeIntent(intent);
    const output = getOutputChannel();
    const profile = getActiveProfile();
    const { primaryMappings, fallbackMappings } = getUserMappings(profile);

    log(output, normalized, 'info', 'IR001', `step=normalize intent=${normalized.intent}`);

    const resolved = resolveCapabilities(normalized, primaryMappings, fallbackMappings);
    log(output, normalized, 'info', 'IR002', `step=resolve count=${resolved.length}`);

    if (resolved.length === 0) {
        log(output, normalized, 'warn', 'IR003', 'step=resolve empty=true');
        vscode.window.showWarningMessage(`No capabilities resolved for intent: ${normalized.intent}`);
        return false;
    }

    const providerFiltered = filterByProfileProviders(profile, resolved);
    log(output, normalized, 'info', 'IR009', `step=profileProviders count=${providerFiltered.length}`);

    if (providerFiltered.length === 0) {
        log(output, normalized, 'warn', 'IR010', 'step=profileProviders empty=true');
        vscode.window.showWarningMessage(`No capabilities matched enabled providers for intent: ${normalized.intent}`);
        return false;
    }

    const filtered = filterByProviderTarget(normalized, providerFiltered);
    log(output, normalized, 'info', 'IR004', `step=filter count=${filtered.length}`);

    if (filtered.length === 0) {
        log(output, normalized, 'warn', 'IR005', 'step=filter empty=true');
        vscode.window.showWarningMessage(`No capabilities matched provider/target for intent: ${normalized.intent}`);
        return false;
    }

    let success = true;
    for (const entry of filtered) {
        const stepOk = await executeResolution(normalized, entry, output);
        if (!stepOk) {
            success = false;
        }
    }

    return success;
}

function getUserMappings(profile?: ProfileConfig): { primaryMappings: UserMapping[]; fallbackMappings: UserMapping[] } {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const rawMappings = config.get<UserMapping[]>('mappings', []);
    const profileMappings = profile?.mappings ?? [];

    if (!Array.isArray(rawMappings)) {
        return {
            primaryMappings: sanitizeMappings(profileMappings),
            fallbackMappings: []
        };
    }

    return {
        primaryMappings: sanitizeMappings(profileMappings),
        fallbackMappings: sanitizeMappings(rawMappings)
    };
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

function getActiveProfile(): ProfileConfig | undefined {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const name = config.get<string>('activeProfile', '');
    if (!name) {
        return undefined;
    }

    const profiles = config.get<ProfileConfig[]>('profiles', []);
    if (!Array.isArray(profiles)) {
        return undefined;
    }

    return profiles.find(profile => profile?.name === name);
}

function sanitizeMappings(mappings: UserMapping[]): UserMapping[] {
    if (!Array.isArray(mappings)) {
        return [];
    }
    return mappings.filter(m => !!m && typeof m.capability === 'string' && typeof m.command === 'string');
}

function filterByProfileProviders(profile: ProfileConfig | undefined, entries: Resolution[]): Resolution[] {
    if (!profile) {
        return entries;
    }

    const enabled = Array.isArray(profile.enabledProviders) ? profile.enabledProviders : [];
    const disabled = Array.isArray(profile.disabledProviders) ? profile.disabledProviders : [];

    return entries.filter(entry => {
        if (entry.provider && disabled.includes(entry.provider)) {
            return false;
        }
        if (enabled.length > 0) {
            return entry.provider !== undefined && enabled.includes(entry.provider);
        }
        return true;
    });
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

async function executeResolution(intent: Intent, entry: Resolution, output: vscode.OutputChannel): Promise<boolean> {
    const meta = intent.meta ?? {};
    const adapter = getProviderAdapter(entry.type);
    if (!adapter) {
        log(output, intent, 'warn', 'IR006', `step=transport skip type=${entry.type} capability=${entry.capability}`);
        return false;
    }

    const payload = entry.mapPayload ? entry.mapPayload(intent) : intent.payload;
    log(
        output,
        intent,
        'info',
        'IR007',
        `step=execute command=${entry.command} source=${entry.source} dryRun=${meta.dryRun ? 'true' : 'false'} type=${entry.type}`
    );

    if (meta.dryRun) {
        return true;
    }

    try {
        await adapter.invoke(entry, payload, intent);
        return true;
    } catch (error) {
        log(output, intent, 'error', 'IR008', `step=execute error command=${entry.command}`);
        console.error(`Failed to execute capability ${entry.command}:`, error);
        vscode.window.showErrorMessage(`Failed to execute ${entry.command}: ${error}`);
        return false;
    }
}

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Intent Router');
    }
    return outputChannel;
}

function log(
    output: vscode.OutputChannel,
    intent: Intent,
    level: 'error' | 'warn' | 'info' | 'debug',
    code: string,
    message: string
): void {
    const minLevel = getLogLevel();
    if (!shouldLog(level, minLevel)) {
        return;
    }

    const traceId = intent.meta?.traceId ?? 'unknown';
    output.appendLine(`[${traceId}] ${level.toUpperCase()} ${code} ${message}`);
    if (intent.meta?.debug) {
        console.log(`[${traceId}] ${level.toUpperCase()} ${code} ${message}`);
    }
}

function generateTraceId(): string {
    const rand = Math.floor(Math.random() * 1e8).toString(16);
    return `${Date.now().toString(16)}-${rand}`;
}

function getLogLevel(): 'error' | 'warn' | 'info' | 'debug' {
    if (cachedLogLevel) {
        return cachedLogLevel;
    }
    const config = vscode.workspace.getConfiguration('intentRouter');
    const level = config.get<string>('logLevel', 'info');
    if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
        cachedLogLevel = level;
        return level;
    }
    cachedLogLevel = 'info';
    return 'info';
}

function shouldLog(level: 'error' | 'warn' | 'info' | 'debug', minLevel: 'error' | 'warn' | 'info' | 'debug'): boolean {
    const weights: Record<string, number> = {
        error: 3,
        warn: 2,
        info: 1,
        debug: 0
    };
    return weights[level] >= weights[minLevel];
}

const providerAdapters: ProviderAdapter[] = [
    {
        type: 'vscode',
        invoke: async (entry, payload) => {
            await vscode.commands.executeCommand(entry.command, payload);
        }
    },
    {
        type: 'external',
        invoke: async (entry, _payload, intent) => {
            const traceId = intent.meta?.traceId ?? 'unknown';
            const message = `[${traceId}] External provider not implemented for capability ${entry.capability}`;
            throw new Error(message);
        }
    }
];

function getProviderAdapter(type: 'vscode' | 'external'): ProviderAdapter | undefined {
    return providerAdapters.find(adapter => adapter.type === type);
}

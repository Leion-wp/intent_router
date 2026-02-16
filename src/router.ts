import * as vscode from 'vscode';
import { Intent, ProfileConfig, ProviderAdapter, Resolution, UserMapping } from './types';
import { resolveCapabilities } from './registry';
import { generateSecureTraceId } from './security';

let cachedLogLevel: 'error' | 'warn' | 'info' | 'debug' | undefined;

export function invalidateLogLevelCache(): void {
    cachedLogLevel = undefined;
}

export async function routeIntent(intent: Intent, variableCache?: Map<string, string>): Promise<any> {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const output = getOutputChannel();
    const minLevel = getLogLevel(config);
    const normalized = normalizeIntent(intent, config);

    // Recursive Execution Logic (Composite Pattern)
    if (intent.steps && intent.steps.length > 0) {
        log(output, normalized, minLevel, 'info', 'IR016', `step=composite-start count=${intent.steps.length}`);

        let lastResult: any = true;
        for (const childStep of intent.steps) {
            const childIntent: Intent = {
                ...childStep,
                meta: {
                    ...(normalized.meta ?? {}),
                    ...(childStep.meta ?? {})
                }
            };

            lastResult = await routeIntent(childIntent, variableCache);
            if (!lastResult && lastResult !== "") { // Handle empty string as success but falsy
                log(output, normalized, minLevel, 'warn', 'IR017', 'step=composite-fail');
                return false;
            }
        }

        log(output, normalized, minLevel, 'info', 'IR018', 'step=composite-end');
        return lastResult;
    }

    // Atomic Execution Logic
    const profile = getActiveProfile(config);
    const { primaryMappings, fallbackMappings } = getUserMappings(config, profile);

    log(output, normalized, minLevel, 'info', 'IR001', `step=normalize intent=${normalized.intent}`);

    const resolved = resolveCapabilities(normalized, primaryMappings, fallbackMappings);
    if (resolved.length === 0) {
        log(output, normalized, minLevel, 'warn', 'IR003', 'step=resolve empty=true');
        vscode.window.showWarningMessage(`No capabilities resolved for intent: ${normalized.intent}`);
        return false;
    }

    const providerFiltered = filterByProfileProviders(profile, resolved);
    if (providerFiltered.length === 0) {
        log(output, normalized, minLevel, 'warn', 'IR010', 'step=profileProviders empty=true');
        vscode.window.showWarningMessage(`No capabilities matched enabled providers for intent: ${normalized.intent}`);
        return false;
    }

    const filtered = filterByProviderTarget(normalized, providerFiltered);
    if (filtered.length === 0) {
        log(output, normalized, minLevel, 'warn', 'IR005', 'step=filter empty=true');
        vscode.window.showWarningMessage(`No capabilities matched provider/target for intent: ${normalized.intent}`);
        return false;
    }

    const expanded = expandCompositeResolutions(normalized, filtered);
    if (expanded.length === 0) {
        log(output, normalized, minLevel, 'warn', 'IR012', 'step=expand empty=true');
        vscode.window.showWarningMessage(`No executable steps after expansion for intent: ${normalized.intent}`);
        return false;
    }

    let finalResult: any = true;
    for (const entry of expanded) {
        const result = await executeResolution(normalized, entry, output, minLevel, variableCache);
        if (result === false) {
            return false;
        }
        finalResult = result;
    }

    return finalResult;
}

function getUserMappings(config: vscode.WorkspaceConfiguration, profile?: ProfileConfig): { primaryMappings: UserMapping[]; fallbackMappings: UserMapping[] } {
    const rawMappings = config.get<UserMapping[]>('mappings', []);
    const profileMappings = profile?.mappings ?? [];
    if (!Array.isArray(rawMappings)) {
        return { primaryMappings: profileMappings, fallbackMappings: [] };
    }
    return { primaryMappings: profileMappings, fallbackMappings: rawMappings };
}

function filterByProfileProviders(profile: ProfileConfig | undefined, resolved: Resolution[]): Resolution[] {
    if (!profile) return resolved;
    const enabled = Array.isArray(profile.enabledProviders) ? profile.enabledProviders : [];
    const disabled = Array.isArray(profile.disabledProviders) ? profile.disabledProviders : [];
    return resolved.filter(entry => {
        if (enabled.length > 0 && entry.provider && !enabled.includes(entry.provider)) return false;
        if (disabled.length > 0 && entry.provider && disabled.includes(entry.provider)) return false;
        return true;
    });
}

function filterByProviderTarget(intent: Intent, resolved: Resolution[]): Resolution[] {
    const targetProvider = intent.provider;
    const targetName = intent.target;
    if (!targetProvider && !targetName) return resolved;
    return resolved.filter(entry => {
        if (targetProvider && entry.provider && entry.provider !== targetProvider) return false;
        if (targetName && entry.target && entry.target !== targetName) return false;
        return true;
    });
}

function expandCompositeResolutions(intent: Intent, resolved: Resolution[]): Resolution[] {
    const output: Resolution[] = [];
    for (const entry of resolved) {
        if (entry.capabilityType === 'composite' && Array.isArray(entry.compositeSteps)) {
            for (const step of entry.compositeSteps) {
                output.push({
                    capability: step.capability,
                    command: step.command,
                    provider: step.provider,
                    target: step.target,
                    type: step.type ?? 'vscode',
                    capabilityType: 'atomic',
                    source: 'composite'
                });
            }
        } else {
            output.push(entry);
        }
    }
    return output;
}

function normalizeIntent(intent: Intent, config: vscode.WorkspaceConfiguration): Intent {
    const debugDefault = config.get<boolean>('debug', false);
    const meta = {
        ...(intent.meta ?? {}),
        dryRun: intent.meta?.dryRun ?? false,
        traceId: intent.meta?.traceId ?? generateSecureTraceId(),
        debug: intent.meta?.debug ?? debugDefault
    };
    const rawCapabilities = (intent.capabilities && intent.capabilities.length > 0) ? intent.capabilities : [intent.intent];
    const capabilities = rawCapabilities.map(canonicalizeCapabilityId);
    return { ...intent, capabilities, meta };
}

function canonicalizeCapabilityId(capability: string): string {
    const raw = (capability ?? '').trim();
    if (!raw) return raw;
    const parts = raw.split('.').filter(Boolean);
    if (parts.length < 3) return raw;
    const first = parts[0];
    let i = 1;
    while (i < parts.length - 1 && parts[i] === first) i += 1;
    if (i === 1) return raw;
    return [first, ...parts.slice(i)].join('.');
}

function getActiveProfile(config: vscode.WorkspaceConfiguration): ProfileConfig | undefined {
    const activeName = config.get<string>('activeProfile', '');
    if (!activeName) return undefined;
    const profiles = config.get<ProfileConfig[]>('profiles', []);
    return profiles.find(p => p.name === activeName);
}

async function resolveVariables(input: any, cache?: Map<string, string>): Promise<any> {
    if (typeof input === 'string') {
        const regex = /\$\{input:([^}]+)\}/g;
        let match;
        let result = input;
        while ((match = regex.exec(input)) !== null) {
            const fullMatch = match[0];
            const promptText = match[1];
            let value = cache?.get(promptText);
            if (value === undefined) {
                value = await vscode.window.showInputBox({ prompt: promptText, placeHolder: `Value for ${promptText}` });
                if (value === undefined) throw new Error(`Input cancelled for variable: ${promptText}`);
                if (cache) cache.set(promptText, value);
            }
            result = result.replace(fullMatch, value);
        }
        return result;
    } else if (Array.isArray(input)) {
        return Promise.all(input.map(item => resolveVariables(item, cache)));
    } else if (typeof input === 'object' && input !== null) {
        const resolved: any = {};
        for (const key of Object.keys(input)) resolved[key] = await resolveVariables(input[key], cache);
        return resolved;
    }
    return input;
}

async function executeResolution(
    intent: Intent,
    entry: Resolution,
    output: vscode.OutputChannel,
    minLevel: 'error' | 'warn' | 'info' | 'debug',
    variableCache?: Map<string, string>
): Promise<any> {
    const meta = intent.meta ?? {};
    if (entry.capabilityType !== 'atomic') return false;
    const adapter = getProviderAdapter(entry.type);
    if (!adapter) return false;

    if (intent.description) log(output, intent, minLevel, 'info', 'IR014', `[STEP] ${intent.description}`);

    let payload = entry.mapPayload ? entry.mapPayload(intent) : intent.payload;
    try {
        payload = await resolveVariables(payload, variableCache);
    } catch (error) {
         vscode.window.showWarningMessage('Pipeline cancelled by user.');
         return false;
    }

    if (entry.args && !meta.dryRun) {
        payload = payload || {};
        for (const arg of entry.args) {
            const val = payload[arg.name];
            if (arg.required && (val === undefined || val === null || val === '')) {
                vscode.window.showErrorMessage(`Missing required argument: ${arg.name} for ${entry.capability}`);
                return false;
            }
            if (val === undefined && arg.default !== undefined) payload[arg.name] = arg.default;
        }
    }

    if (typeof payload === 'object' && payload !== null && intent.meta) {
        payload = { ...payload, __meta: intent.meta };
    }

    log(output, intent, minLevel, 'info', 'IR007', `step=execute command=${entry.command} dryRun=${meta.dryRun}`);

    if (meta.dryRun) return true;

    try {
        const result = await adapter.invoke(entry, payload, intent);
        return result !== undefined ? result : true;
    } catch (error) {
        log(output, intent, minLevel, 'error', 'IR008', `step=execute error command=${entry.command}`);
        vscode.window.showErrorMessage(`Failed to execute ${entry.command}: ${error}`);
        return false;
    }
}

let outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) outputChannel = vscode.window.createOutputChannel('Intent Router');
    return outputChannel;
}

function log(output: vscode.OutputChannel, intent: Intent, minLevel: any, level: any, code: string, message: string): void {
    if (!shouldLog(level, minLevel)) return;
    const traceId = intent.meta?.traceId ?? 'unknown';
    output.appendLine(`[${traceId}] ${level.toUpperCase()} ${code} ${message}`);
}

function getLogLevel(config: vscode.WorkspaceConfiguration): any {
    const level = config.get<string>('logLevel', 'info');
    return level;
}

function shouldLog(level: string, minLevel: string): boolean {
    const weights: Record<string, number> = { error: 3, warn: 2, info: 1, debug: 0 };
    return weights[level] >= weights[minLevel];
}

const providerAdapters: ProviderAdapter[] = [
    { type: 'vscode', invoke: async (entry, payload) => await vscode.commands.executeCommand(entry.command, payload) },
    { type: 'external', invoke: async (entry) => { throw new Error(`External provider not implemented for ${entry.capability}`); } }
];

function getProviderAdapter(type: 'vscode' | 'external'): ProviderAdapter | undefined {
    return providerAdapters.find(adapter => adapter.type === type);
}

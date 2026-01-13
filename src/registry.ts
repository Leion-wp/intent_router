import { Capability, Intent, RegisterCapabilitiesArgs, UserMapping } from './types';

const registeredCapabilities: Capability[] = [];

export function registerCapabilities(args: RegisterCapabilitiesArgs): number {
    if (!args || !args.capabilities || args.capabilities.length === 0) {
        return 0;
    }

    const base = {
        provider: args.provider,
        target: args.target,
        type: args.type ?? 'vscode'
    };

    let count = 0;

    if (typeof args.capabilities[0] === 'string') {
        if (!args.command) {
            return 0;
        }
        for (const cap of args.capabilities as string[]) {
            registeredCapabilities.push({
                capability: cap,
                command: args.command,
                description: `Resolved capability: ${cap}`,
                mapPayload: args.mapPayload,
                ...base
            });
            count += 1;
        }
        return count;
    }

    for (const entry of args.capabilities as Array<{ capability: string; command: string; mapPayload?: (intent: Intent) => any; }>) {
        if (!entry.capability || !entry.command) {
            continue;
        }
        registeredCapabilities.push({
            capability: entry.capability,
            command: entry.command,
            description: `Resolved capability: ${entry.capability}`,
            mapPayload: entry.mapPayload ?? args.mapPayload,
            ...base
        });
        count += 1;
    }

    return count;
}

function matchesIntent(intent: Intent, entry: { provider?: string; target?: string }): boolean {
    if (intent.provider && entry.provider && entry.provider !== intent.provider) {
        return false;
    }
    if (intent.target && entry.target && entry.target !== intent.target) {
        return false;
    }
    return true;
}

function resolveWithPreference<T extends { provider?: string; target?: string }>(
    intent: Intent,
    entries: T[]
): T[] {
    if (intent.provider || intent.target) {
        const exact = entries.filter(e => {
            if (intent.provider && e.provider !== intent.provider) {
                return false;
            }
            if (intent.target && e.target !== intent.target) {
                return false;
            }
            return true;
        });
        if (exact.length > 0) {
            return exact;
        }
    }
    return entries;
}

export function resolveCapabilities(intent: Intent, userMappings: UserMapping[] = []): Capability[] {
    if (!intent.capabilities || intent.capabilities.length === 0) {
        return [];
    }

    const resolved: Capability[] = [];

    for (const cap of intent.capabilities) {
        const userMatches = userMappings.filter(m => m.capability === cap && matchesIntent(intent, m));
        const preferredUser = resolveWithPreference(intent, userMatches);
        if (preferredUser.length > 0) {
            for (const entry of preferredUser) {
                resolved.push({
                    capability: entry.capability,
                    command: entry.command,
                    description: `Resolved capability: ${entry.capability}`,
                    provider: entry.provider,
                    target: entry.target,
                    type: entry.type ?? 'vscode'
                });
            }
            continue;
        }

        const registryMatches = registeredCapabilities.filter(r => r.capability === cap && matchesIntent(intent, r));
        const preferredRegistry = resolveWithPreference(intent, registryMatches);
        if (preferredRegistry.length > 0) {
            resolved.push(...preferredRegistry);
            continue;
        }

        resolved.push({
            capability: cap,
            command: cap,
            description: `Resolved capability: ${cap}`,
            type: 'vscode'
        });
    }

    return resolved;
}

import { Capability, Intent, RegisterCapabilitiesArgs, Resolution, UserMapping } from './types';

const registeredCapabilities: Capability[] = [];

export function resetRegistry(): void {
    registeredCapabilities.length = 0;
}

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

export function resolveCapabilities(
    intent: Intent,
    userMappings: UserMapping[] = [],
    fallbackMappings: UserMapping[] = []
): Resolution[] {
    if (!intent.capabilities || intent.capabilities.length === 0) {
        return [];
    }

    const resolved: Resolution[] = [];

    for (const cap of intent.capabilities) {
        const userMatches = userMappings.filter(m => m.capability === cap);
        if (userMatches.length > 0) {
            for (const entry of userMatches) {
                resolved.push({
                    capability: entry.capability,
                    command: entry.command,
                    provider: entry.provider,
                    target: entry.target,
                    type: entry.type ?? 'vscode',
                    source: 'user'
                });
            }
            continue;
        }

        const fallbackMatches = fallbackMappings.filter(m => m.capability === cap);
        if (fallbackMatches.length > 0) {
            for (const entry of fallbackMatches) {
                resolved.push({
                    capability: entry.capability,
                    command: entry.command,
                    provider: entry.provider,
                    target: entry.target,
                    type: entry.type ?? 'vscode',
                    source: 'user'
                });
            }
            continue;
        }

        const registryMatches = registeredCapabilities.filter(r => r.capability === cap);
        if (registryMatches.length > 0) {
            for (const entry of registryMatches) {
                resolved.push({
                    capability: entry.capability,
                    command: entry.command,
                    provider: entry.provider,
                    target: entry.target,
                    type: entry.type ?? 'vscode',
                    mapPayload: entry.mapPayload,
                    source: 'registry'
                });
            }
            continue;
        }

        resolved.push({
            capability: cap,
            command: cap,
            type: 'vscode',
            source: 'fallback'
        });
    }

    return resolved;
}

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

function buildMapping<T extends { capability: string }>(entries: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const entry of entries) {
        const list = map.get(entry.capability);
        if (list) {
            list.push(entry);
        } else {
            map.set(entry.capability, [entry]);
        }
    }
    return map;
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
    const userMap = buildMapping(userMappings);
    const fallbackMap = buildMapping(fallbackMappings);
    const registryMap = buildMapping(registeredCapabilities);

    for (const cap of intent.capabilities) {
        const userMatches = userMap.get(cap);
        if (userMatches) {
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

        const fallbackMatches = fallbackMap.get(cap);
        if (fallbackMatches) {
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

        const registryMatches = registryMap.get(cap);
        if (registryMatches) {
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

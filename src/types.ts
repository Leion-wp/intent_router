export type Intent = {
    intent: string;
    capabilities?: string[];
    payload?: any;
    provider?: string;
    target?: string;
    meta?: {
        dryRun?: boolean;
        traceId?: string;
        debug?: boolean;
    };
};

export type ProviderType = 'vscode' | 'external';

export type Capability = {
    capability: string;
    command: string;
    description?: string;
    provider?: string;
    target?: string;
    type?: ProviderType;
    mapPayload?: (intent: Intent) => any;
};

export type Resolution = {
    capability: string;
    command: string;
    provider?: string;
    target?: string;
    type: ProviderType;
    mapPayload?: (intent: Intent) => any;
    source: 'user' | 'registry' | 'fallback';
};

export type ProviderAdapter = {
    type: ProviderType;
    invoke: (entry: Resolution, payload: any, intent: Intent) => Promise<void>;
};

export type ProfileConfig = {
    name: string;
    mappings?: UserMapping[];
    enabledProviders?: string[];
    disabledProviders?: string[];
};

export type UserMapping = {
    capability: string;
    command: string;
    provider?: string;
    target?: string;
    type?: ProviderType;
};

export type RegisterCapabilitiesArgs = {
    provider?: string;
    target?: string;
    type?: ProviderType;
    capabilities: string[] | Array<{
        capability: string;
        command: string;
        mapPayload?: (intent: Intent) => any;
    }>;
    command?: string;
    mapPayload?: (intent: Intent) => any;
};

export type Intent = {
    intent: string;
    capabilities?: string[];
    payload?: any;
    provider?: string;
    target?: string;
    meta?: Record<string, any>;
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

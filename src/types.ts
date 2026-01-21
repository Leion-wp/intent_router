export type Intent = {
    intent: string;
    description?: string;
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
export type CapabilityType = 'atomic' | 'composite';

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
    capabilityType: CapabilityType;
    mapPayload?: (intent: Intent) => any;
    source: 'user' | 'registry' | 'fallback' | 'composite';
    compositeSteps?: CompositeStep[];
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

export type CompositeStep = {
    capability: string;
    command: string;
    provider?: string;
    target?: string;
    type?: ProviderType;
    payload?: any;
    mapPayload?: (intent: Intent) => any;
};

export type CompositeCapability = {
    capability: string;
    capabilityType: 'composite';
    provider?: string;
    target?: string;
    type?: ProviderType;
    steps: CompositeStep[];
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
        capabilityType?: CapabilityType;
        steps?: CompositeStep[];
        mapPayload?: (intent: Intent) => any;
    }>;
    command?: string;
    mapPayload?: (intent: Intent) => any;
};

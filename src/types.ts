export type Intent = {
    intent: string;
    description?: string;
    capabilities?: string[];
    steps?: Intent[];
    payload?: any;
    provider?: string;
    target?: string;
    meta?: {
        dryRun?: boolean;
        traceId?: string;
        debug?: boolean;
        ui?: any;
    };
};

export type ProviderType = 'vscode' | 'external';
export type CapabilityType = 'atomic' | 'composite';

export type CapabilityArgument = {
    name: string;
    type: 'string' | 'boolean' | 'enum' | 'path';
    description?: string;
    options?: string[] | string; // Array for static, String for dynamic command
    required?: boolean;
    default?: any;
};

export type Capability = {
    capability: string;
    command: string;
    description?: string;
    provider?: string;
    target?: string;
    type?: ProviderType;
    args?: CapabilityArgument[];
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
    args?: CapabilityArgument[];
    description?: string;
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
        args?: CapabilityArgument[];
        description?: string;
        mapPayload?: (intent: Intent) => any;
    }>;
    command?: string;
    mapPayload?: (intent: Intent) => any;
};

export type Intent = {
    id?: string;
    intent: string;
    description?: string;
    capabilities?: string[];
    steps?: Intent[];
    payload?: any;
    provider?: string;
    target?: string;
    onFailure?: string;
    retry?: {
        mode?: 'none' | 'simple' | 'fixed' | 'exponential';
        maxAttempts?: number;
        delayMs?: number;
        maxDelayMs?: number;
        jitterMs?: number;
    };
    continueOnError?: boolean;
    captureErrorVar?: string;
    meta?: {
        dryRun?: boolean;
        traceId?: string;
        debug?: boolean;
        runId?: string;
        stepId?: string;
        cwd?: string;
        subPipelineDepth?: number;
        ui?: any;
    };
};

export type ProviderType = 'vscode' | 'external';
export type CapabilityType = 'atomic' | 'composite';
export type Determinism = 'deterministic' | 'interactive';

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
    determinism?: Determinism;
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
    args?: CapabilityArgument[];
    determinism?: Determinism;
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
    determinism?: Determinism;
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
        determinism?: Determinism;
    }>;
    command?: string;
    mapPayload?: (intent: Intent) => any;
};

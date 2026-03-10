import { z } from 'zod';
import {
    Intent,
    ProviderType,
    CapabilityType,
    Determinism,
    CapabilityArgument,
    Capability,
    Resolution,
    ProviderAdapter,
    ProfileConfig,
    CompositeStep,
    CompositeCapability,
    UserMapping,
    RegisterCapabilitiesArgs
} from './types';

export const ProviderTypeSchema: z.ZodType<ProviderType> = z.enum(['vscode', 'external']);
export const CapabilityTypeSchema: z.ZodType<CapabilityType> = z.enum(['atomic', 'composite']);
export const DeterminismSchema: z.ZodType<Determinism> = z.enum(['deterministic', 'interactive']);

export const IntentSchema: z.ZodType<Intent> = z.lazy(() => z.object({
    id: z.string().optional(),
    intent: z.string(),
    description: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    steps: z.array(IntentSchema).optional(),
    payload: z.any().optional(),
    provider: z.string().optional(),
    target: z.string().optional(),
    onFailure: z.string().optional(),
    retry: z.object({
        mode: z.enum(['none', 'simple', 'fixed', 'exponential']).optional(),
        maxAttempts: z.number().optional(),
        delayMs: z.number().optional(),
        maxDelayMs: z.number().optional(),
        jitterMs: z.number().optional()
    }).optional(),
    continueOnError: z.boolean().optional(),
    captureErrorVar: z.string().optional(),
    meta: z.object({
        dryRun: z.boolean().optional(),
        traceId: z.string().optional(),
        debug: z.boolean().optional(),
        runId: z.string().optional(),
        stepId: z.string().optional(),
        subPipelineDepth: z.number().optional(),
        ui: z.any().optional(),
    }).optional(),
}));

export const CapabilityArgumentSchema: z.ZodType<CapabilityArgument> = z.object({
    name: z.string(),
    type: z.enum(['string', 'boolean', 'enum', 'path']),
    description: z.string().optional(),
    options: z.union([z.array(z.string()), z.string()]).optional(),
    required: z.boolean().optional(),
    default: z.any().optional(),
});

export const CapabilitySchema: z.ZodType<Capability> = z.object({
    capability: z.string(),
    command: z.string(),
    description: z.string().optional(),
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema.optional(),
    args: z.array(CapabilityArgumentSchema).optional(),
    mapPayload: z.function().args(IntentSchema).returns(z.any()).optional(),
    determinism: DeterminismSchema.optional(),
});

export const CompositeStepSchema: z.ZodType<CompositeStep> = z.object({
    capability: z.string(),
    command: z.string(),
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema.optional(),
    payload: z.any().optional(),
    mapPayload: z.function().args(IntentSchema).returns(z.any()).optional(),
});

export const ResolutionSchema: z.ZodType<Resolution> = z.object({
    capability: z.string(),
    command: z.string(),
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema,
    capabilityType: CapabilityTypeSchema,
    mapPayload: z.function().args(IntentSchema).returns(z.any()).optional(),
    source: z.enum(['user', 'registry', 'fallback', 'composite']),
    compositeSteps: z.array(CompositeStepSchema).optional(),
    args: z.array(CapabilityArgumentSchema).optional(),
    determinism: DeterminismSchema.optional(),
});

export const ProviderAdapterSchema: z.ZodType<ProviderAdapter> = z.object({
    type: ProviderTypeSchema,
    invoke: z.function().args(ResolutionSchema, z.any(), IntentSchema).returns(z.promise(z.void())),
});

export const UserMappingSchema: z.ZodType<UserMapping> = z.object({
    capability: z.string(),
    command: z.string(),
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema.optional(),
});

export const ProfileConfigSchema: z.ZodType<ProfileConfig> = z.object({
    name: z.string(),
    mappings: z.array(UserMappingSchema).optional(),
    enabledProviders: z.array(z.string()).optional(),
    disabledProviders: z.array(z.string()).optional(),
});

export const CompositeCapabilitySchema: z.ZodType<CompositeCapability> = z.object({
    capability: z.string(),
    capabilityType: z.literal('composite'),
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema.optional(),
    steps: z.array(CompositeStepSchema),
    args: z.array(CapabilityArgumentSchema).optional(),
    description: z.string().optional(),
    determinism: DeterminismSchema.optional(),
});

export const RegisterCapabilitiesArgsSchema: z.ZodType<RegisterCapabilitiesArgs> = z.object({
    provider: z.string().optional(),
    target: z.string().optional(),
    type: ProviderTypeSchema.optional(),
    capabilities: z.union([
        z.array(z.string()),
        z.array(z.object({
            capability: z.string(),
            command: z.string(),
            capabilityType: CapabilityTypeSchema.optional(),
            steps: z.array(CompositeStepSchema).optional(),
            args: z.array(CapabilityArgumentSchema).optional(),
            description: z.string().optional(),
            mapPayload: z.function().args(IntentSchema).returns(z.any()).optional(),
            determinism: DeterminismSchema.optional(),
        }))
    ]),
    command: z.string().optional(),
    mapPayload: z.function().args(IntentSchema).returns(z.any()).optional(),
});

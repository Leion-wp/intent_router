import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);

export const TimestampSchema = NonEmptyStringSchema;
export const AuthModeSchema = z.enum(['api_key', 'oauth_device']);
export const PlanTierSchema = z.enum(['free', 'founding_pilot', 'starter', 'growth', 'enterprise']);
export const BillingModelSchema = z.enum(['pilot_plus_subscription', 'subscription']);
export const BillingIntervalSchema = z.enum(['one_time', 'monthly', 'annual']);
export const TriggerSourceSchema = z.enum(['manual', 'webhook', 'cron', 'watch']);
export const RunnerTypeSchema = z.enum(['vscode_extension', 'cli_agent', 'private_runner']);
export const RunStatusSchema = z.enum([
    'queued',
    'leased',
    'running',
    'awaiting_approval',
    'succeeded',
    'failed',
    'cancelled'
]);
export const ApprovalDecisionSchema = z.enum(['approved', 'rejected']);
export const ArtifactKindSchema = z.enum(['patch', 'diff', 'log', 'report', 'export']);
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const OrganizationSchema = z.object({
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    slug: NonEmptyStringSchema,
    planTier: PlanTierSchema,
    active: z.boolean().default(true),
    createdAt: TimestampSchema
});

export const WorkspaceSchema = z.object({
    id: NonEmptyStringSchema,
    organizationId: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    slug: NonEmptyStringSchema,
    repoLimit: z.number().int().positive(),
    workflowLimit: z.number().int().positive(),
    active: z.boolean().default(true),
    createdAt: TimestampSchema
});

export const RepoConnectionSchema = z.object({
    id: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    provider: z.literal('github'),
    repoSlug: NonEmptyStringSchema,
    defaultBranch: NonEmptyStringSchema,
    webhookEnabled: z.boolean().default(false),
    localExecutionRequired: z.boolean().default(true)
});

export const PipelineTemplateSchema = z.object({
    id: NonEmptyStringSchema,
    key: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    pipelinePath: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    category: z.literal('delivery'),
    requiresHumanApproval: z.boolean().default(true),
    defaultTriggerModes: z.array(TriggerSourceSchema).min(1)
});

export const RunArtifactSchema = z.object({
    kind: ArtifactKindSchema,
    label: NonEmptyStringSchema,
    uri: NonEmptyStringSchema,
    contentType: NonEmptyStringSchema.optional()
});

export const ApprovalEventSchema = z.object({
    stepId: NonEmptyStringSchema,
    decision: ApprovalDecisionSchema,
    reviewer: NonEmptyStringSchema,
    decidedAt: TimestampSchema,
    note: z.string().optional()
});

export const RunLogLineSchema = z.object({
    timestamp: TimestampSchema,
    level: LogLevelSchema,
    message: NonEmptyStringSchema
});

export const RunSchema = z.object({
    id: NonEmptyStringSchema,
    organizationId: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    repoConnectionId: NonEmptyStringSchema,
    templateId: NonEmptyStringSchema,
    status: RunStatusSchema,
    source: TriggerSourceSchema,
    startedAt: TimestampSchema,
    finishedAt: TimestampSchema.optional(),
    triggerEvent: z.record(z.any()).optional(),
    approvals: z.array(ApprovalEventSchema).default([]),
    artifacts: z.array(RunArtifactSchema).default([]),
    logs: z.array(RunLogLineSchema).default([])
});

export const PolicyPackSchema = z.object({
    id: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    version: NonEmptyStringSchema,
    reviewMode: z.enum(['warn', 'block']).default('warn'),
    blockedPaths: z.array(NonEmptyStringSchema).default([]),
    blockedExtensions: z.array(NonEmptyStringSchema).default([]),
    maxChangedLines: z.number().int().nonnegative().default(0),
    allowNetwork: z.boolean().default(true),
    allowFileWrite: z.boolean().default(true)
});

export const SecretSchema = z.object({
    id: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    scope: z.enum(['organization', 'workspace', 'repo']),
    provider: z.enum(['byo_user', 'byo_org', 'vault', 'dev_plaintext']),
    maskedPreview: z.string().optional(),
    lastRotatedAt: TimestampSchema.optional()
});

export const BillingAccountSchema = z.object({
    id: NonEmptyStringSchema,
    organizationId: NonEmptyStringSchema,
    billingModel: BillingModelSchema,
    planTier: PlanTierSchema,
    currency: z.literal('EUR'),
    billingInterval: BillingIntervalSchema,
    byoAiKeysRequired: z.boolean().default(true),
    seatBased: z.boolean().default(false),
    repoLimit: z.number().int().positive(),
    workflowLimit: z.number().int().positive(),
    monthlyRunQuota: z.number().int().positive().optional()
});

export const RunnerRegistrationSchema = z.object({
    id: NonEmptyStringSchema,
    organizationId: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    runnerType: RunnerTypeSchema,
    label: NonEmptyStringSchema,
    version: NonEmptyStringSchema,
    supportsLocalExecution: z.boolean().default(true),
    supportsWebhookRelay: z.boolean().default(false),
    supportsStreamingLogs: z.boolean().default(true),
    supportedIntents: z.array(NonEmptyStringSchema).default([]),
    lastSeenAt: TimestampSchema
});

export const RunnerLeaseRequestSchema = z.object({
    runnerId: NonEmptyStringSchema,
    organizationId: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    maxConcurrentRuns: z.number().int().positive().default(1),
    supportedSources: z.array(TriggerSourceSchema).min(1)
});

export const RunnerJobAssignmentSchema = z.object({
    jobId: NonEmptyStringSchema,
    runId: NonEmptyStringSchema,
    templateId: NonEmptyStringSchema,
    pipelinePath: NonEmptyStringSchema,
    source: TriggerSourceSchema,
    payload: z.record(z.any()).default({}),
    runtimeVariables: z.record(z.string()).default({})
});

export const RunnerStatusUpdateSchema = z.object({
    jobId: NonEmptyStringSchema,
    runId: NonEmptyStringSchema,
    status: RunStatusSchema,
    currentStepId: z.string().optional(),
    logLines: z.array(RunLogLineSchema).default([]),
    approvals: z.array(ApprovalEventSchema).default([]),
    artifacts: z.array(RunArtifactSchema).default([])
});

export const PipelineSyncEnvelopeSchema = z.object({
    organizationId: NonEmptyStringSchema,
    workspaceId: NonEmptyStringSchema,
    repoConnectionId: NonEmptyStringSchema,
    authMode: AuthModeSchema,
    runnerType: RunnerTypeSchema,
    extensionVersion: z.string().optional(),
    templates: z.array(PipelineTemplateSchema).default([]),
    runs: z.array(RunSchema).default([]),
    policyPacks: z.array(PolicyPackSchema).default([])
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type RepoConnection = z.infer<typeof RepoConnectionSchema>;
export type PipelineTemplate = z.infer<typeof PipelineTemplateSchema>;
export type RunArtifact = z.infer<typeof RunArtifactSchema>;
export type ApprovalEvent = z.infer<typeof ApprovalEventSchema>;
export type RunLogLine = z.infer<typeof RunLogLineSchema>;
export type Run = z.infer<typeof RunSchema>;
export type PolicyPack = z.infer<typeof PolicyPackSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type BillingAccount = z.infer<typeof BillingAccountSchema>;
export type RunnerRegistration = z.infer<typeof RunnerRegistrationSchema>;
export type RunnerLeaseRequest = z.infer<typeof RunnerLeaseRequestSchema>;
export type RunnerJobAssignment = z.infer<typeof RunnerJobAssignmentSchema>;
export type RunnerStatusUpdate = z.infer<typeof RunnerStatusUpdateSchema>;
export type PipelineSyncEnvelope = z.infer<typeof PipelineSyncEnvelopeSchema>;

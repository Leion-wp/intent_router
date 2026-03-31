import * as vscode from 'vscode';

export type SalesLeadStage = 'candidate' | 'reviewed' | 'enriched' | 'ready_for_draft' | 'drafted' | 'contacted' | 'discovery' | 'demo' | 'proposal' | 'pilot' | 'won' | 'lost';
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = 'outreach' | 'follow_up' | 'demo' | 'proposal' | 'proof' | 'friction';
export type SalesChannel = 'email' | 'linkedin';
export type SalesProviderId = 'email' | 'google_sheets' | 'crm' | 'linkedin' | 'reddit' | 'product_hunt';
export type SalesProviderStatus = 'not_connected' | 'configured' | 'connected';
export type SalesProviderMode = 'draft_only' | 'manual_handoff' | 'sync_only';
export type SalesProviderHealth = 'unknown' | 'healthy' | 'warning' | 'error';
export type SalesProductStage = 'idea' | 'offer' | 'outbound' | 'pilot' | 'won';
export type ProofAssetKind = 'run' | 'doc' | 'metric' | 'snippet' | 'screenshot';
export type ProofAssetStatus = 'draft' | 'ready';
export type McpTransport = 'http' | 'sse' | 'stdio';
export type McpServerStatus = 'not_configured' | 'configured' | 'connected';
export type SalesDraftStatus = 'drafted' | 'reviewed' | 'sent';
export type LeadCandidateStatus = 'candidate' | 'reviewed' | 'rejected';
export type LeadEnrichmentStatus = 'not_started' | 'partial' | 'complete' | 'failed';
export type CampaignQueueStatus = 'ready_for_draft' | 'drafted' | 'reviewed' | 'needs_follow_up' | 'stale';
export type SalesProviderRole = 'research' | 'enrich' | 'sync' | 'draft' | 'proof';
export type ActivityLogSource = 'research' | 'enrichment' | 'sheet' | 'drafts' | 'provider' | 'product' | 'mcp' | 'system';

export type SalesProviderLogEntry = {
    id: string;
    timestamp: string;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    detail?: string;
};

export type LeadScore = {
    total: number;
    label: 'faible' | 'moyen' | 'fort';
    reasons: string[];
    updatedAt: string;
};

export type LeadEnrichmentState = {
    status: LeadEnrichmentStatus;
    attempts: number;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    error?: string;
    sources?: string[];
};

export type SalesCockpitLead = {
    id: string;
    company: string;
    contactName: string;
    role: string;
    email?: string;
    status: SalesLeadStage;
    pain: string;
    nextAction: string;
    owner: string;
    dueDate?: string;
    profileUrl?: string;
    notes?: string;
    domain?: string;
    sourceUrl?: string;
    sourceQuery?: string;
    snippet?: string;
    confidence?: number;
    score?: LeadScore;
    enrichment?: LeadEnrichmentState;
    manualFields?: string[];
    lastContactedAt?: string;
    templateId?: string;
};

export type LeadRecord = SalesCockpitLead;

export type LeadCandidateRecord = {
    id: string;
    company: string;
    domain?: string;
    sourceUrl: string;
    sourceQuery: string;
    snippet: string;
    confidence: number;
    status: LeadCandidateStatus;
    discoveredAt: string;
    notes?: string;
};

export type SalesCockpitTask = {
    id: string;
    title: string;
    status: SalesTaskStatus;
    kind: SalesTaskKind;
    owner: string;
    dueDate?: string;
    leadId?: string;
    detail?: string;
    sourceRef?: string;
};

export type SalesCockpitCampaign = {
    id: string;
    name: string;
    channel: SalesChannel;
    goal: string;
    templateId: string;
    active: boolean;
};

export type SalesCockpitTemplate = {
    id: string;
    name: string;
    channel: SalesChannel;
    subject?: string;
    body: string;
};

export type SalesProviderAccount = {
    id: string;
    provider: SalesProviderId;
    label: string;
    status: SalesProviderStatus;
    mode: SalesProviderMode;
    health?: SalesProviderHealth;
    accountRef?: string;
    endpointUrl?: string;
    notes?: string;
    capabilities: string[];
    scopes?: string[];
    lastValidatedAt?: string;
    lastValidationMessage?: string;
    logs?: SalesProviderLogEntry[];
};

export type SalesCockpitOffer = {
    name: string;
    audience: string;
    problem: string;
    promise: string;
    proof: string;
    callToAction: string;
};

export type SalesCockpitFunnel = {
    acquisition: string;
    qualification: string;
    demo: string;
    proposal: string;
    close: string;
};

export type SalesCockpitProofAsset = {
    id: string;
    title: string;
    kind: ProofAssetKind;
    status: ProofAssetStatus;
    summary: string;
    sourceLabel?: string;
    sourceRef?: string;
    createdAt: string;
};

export type SalesCockpitDraftQueueItem = {
    id: string;
    provider: 'gmail';
    status: SalesDraftStatus;
    to: string;
    subject: string;
    bodyPreview: string;
    createdAt: string;
    leadId?: string;
    draftId?: string;
    threadId?: string;
};

export type CampaignQueueItem = {
    id: string;
    leadId: string;
    company: string;
    channel: SalesChannel;
    templateId?: string;
    status: CampaignQueueStatus;
    dueDate?: string;
    createdAt: string;
    updatedAt: string;
    draftId?: string;
    threadId?: string;
    summary?: string;
};

export type SalesCockpitMcpTool = {
    name: string;
    title?: string;
    description?: string;
    inputSchemaSummary?: string;
};

export type McpToolBinding = {
    serverId: string;
    toolName: string;
    roles: SalesProviderRole[];
    notes?: string;
};

export type SalesCockpitLeadInbox = {
    candidates: LeadCandidateRecord[];
    lastResearchAt?: string;
    lastQueries?: string[];
    lastResearchSummary?: string;
};

export type SheetBinding = {
    sheetUrl?: string;
    spreadsheetId?: string;
    tabs: {
        offer: string;
        leads: string;
        proof: string;
        actions: string;
    };
    lastSyncedAt?: string;
};

export type ProviderRoleBinding = {
    providerId: SalesProviderId;
    roles: SalesProviderRole[];
    notes?: string;
    lastUsedAt?: string;
};

export type ActivityLogEntry = {
    id: string;
    timestamp: string;
    level: 'info' | 'success' | 'warning' | 'error';
    source: ActivityLogSource;
    message: string;
    detail?: string;
    productId?: string;
    stage?: string;
};

export type SalesCockpitProduct = {
    id: string;
    name: string;
    slug: string;
    stage: SalesProductStage;
    notes: string;
    offer: SalesCockpitOffer;
    funnel: SalesCockpitFunnel;
    weeklyTargets: {
        outbound: number;
        discovery: number;
        demos: number;
        proposals: number;
    };
    leads: SalesCockpitLead[];
    tasks: SalesCockpitTask[];
    campaigns: SalesCockpitCampaign[];
    templates: SalesCockpitTemplate[];
    draftQueue: SalesCockpitDraftQueueItem[];
    proofAssets: SalesCockpitProofAsset[];
    pipelinePaths: string[];
    ideaPath?: string;
    implementPath?: string;
    defaultSheetUrl?: string;
    leadInbox: SalesCockpitLeadInbox;
    campaignQueue: CampaignQueueItem[];
    sheetBinding: SheetBinding;
    providerBindings: ProviderRoleBinding[];
    activityLog: ActivityLogEntry[];
    mcpToolBindings: McpToolBinding[];
};

export type SalesCockpitMcpServer = {
    id: string;
    name: string;
    transport: McpTransport;
    endpointUrl?: string;
    command?: string;
    args: string[];
    status: McpServerStatus;
    toolSummary: string[];
    tools?: SalesCockpitMcpTool[];
    notes?: string;
    assignedProductIds: string[];
    lastDiscoveredAt?: string;
    lastDiscoveryError?: string;
};

export type SalesCockpitState = {
    version: 4;
    lastUpdatedAt: string;
    activeProductId: string;
    products: SalesCockpitProduct[];
    mcpServers: SalesCockpitMcpServer[];
    notes: string;
    offer: SalesCockpitOffer;
    funnel: SalesCockpitFunnel;
    weeklyTargets: {
        outbound: number;
        discovery: number;
        demos: number;
        proposals: number;
    };
    leads: SalesCockpitLead[];
    tasks: SalesCockpitTask[];
    campaigns: SalesCockpitCampaign[];
    templates: SalesCockpitTemplate[];
    draftQueue: SalesCockpitDraftQueueItem[];
    providerAccounts: SalesProviderAccount[];
    proofAssets: SalesCockpitProofAsset[];
    pipelinePaths: string[];
    ideaPath?: string;
    implementPath?: string;
    defaultSheetUrl?: string;
    productStage: SalesProductStage;
    leadInbox: SalesCockpitLeadInbox;
    campaignQueue: CampaignQueueItem[];
    sheetBinding: SheetBinding;
    providerBindings: ProviderRoleBinding[];
    activityLog: ActivityLogEntry[];
    mcpToolBindings: McpToolBinding[];
};

const FILE_VERSION = 4 as const;
const SALES_PROVIDER_IDS: SalesProviderId[] = ['email', 'google_sheets', 'crm', 'linkedin', 'reddit', 'product_hunt'];
const SALES_PROVIDER_STATUSES: SalesProviderStatus[] = ['not_connected', 'configured', 'connected'];
const SALES_PROVIDER_MODES: SalesProviderMode[] = ['draft_only', 'manual_handoff', 'sync_only'];
const SALES_PROVIDER_HEALTH: SalesProviderHealth[] = ['unknown', 'healthy', 'warning', 'error'];
const SALES_PRODUCT_STAGES: SalesProductStage[] = ['idea', 'offer', 'outbound', 'pilot', 'won'];
const PROOF_ASSET_KINDS: ProofAssetKind[] = ['run', 'doc', 'metric', 'snippet', 'screenshot'];
const PROOF_ASSET_STATUSES: ProofAssetStatus[] = ['draft', 'ready'];
const MCP_TRANSPORTS: McpTransport[] = ['http', 'sse', 'stdio'];
const MCP_SERVER_STATUSES: McpServerStatus[] = ['not_configured', 'configured', 'connected'];
const SALES_LEAD_STAGES: SalesLeadStage[] = ['candidate', 'reviewed', 'enriched', 'ready_for_draft', 'drafted', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'];
const LEAD_CANDIDATE_STATUSES: LeadCandidateStatus[] = ['candidate', 'reviewed', 'rejected'];
const LEAD_ENRICHMENT_STATUSES: LeadEnrichmentStatus[] = ['not_started', 'partial', 'complete', 'failed'];
const CAMPAIGN_QUEUE_STATUSES: CampaignQueueStatus[] = ['ready_for_draft', 'drafted', 'reviewed', 'needs_follow_up', 'stale'];
const SALES_PROVIDER_ROLES: SalesProviderRole[] = ['research', 'enrich', 'sync', 'draft', 'proof'];

function getWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

export function getSalesCockpitUri(): vscode.Uri | undefined {
    const root = getWorkspaceRoot();
    if (!root) return undefined;
    return vscode.Uri.joinPath(root, '.intent-router', 'sales-cockpit.json');
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.readFile(uri);
        return true;
    } catch {
        return false;
    }
}

async function ensureParentFolder(_uri: vscode.Uri): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) return;
    const parent = vscode.Uri.joinPath(root, '.intent-router');
    await vscode.workspace.fs.createDirectory(parent);
}

function timestamp(): string {
    return new Date().toISOString();
}

export function slugify(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'entry';
}

function normalizeDomain(urlValue?: string): string | undefined {
    const value = String(urlValue || '').trim();
    if (!value) {
        return undefined;
    }
    try {
        return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return undefined;
    }
}

function tokenizeAudience(value: string): string[] {
    return Array.from(new Set(
        String(value || '')
            .toLowerCase()
            .split(/[^a-z0-9]+/g)
            .map((token) => token.trim())
            .filter((token) => token.length >= 4)
    )).slice(0, 8);
}

export function computeLeadScore(lead: SalesCockpitLead, offer?: SalesCockpitOffer): LeadScore {
    const reasons: string[] = [];
    let total = 0;

    if (lead.company) {
        total += 10;
        reasons.push('societe identifiee');
    }
    if (lead.profileUrl || lead.sourceUrl || lead.domain) {
        total += 15;
        reasons.push('surface web exploitable');
    }
    if (lead.email) {
        total += 25;
        reasons.push('email disponible');
    }
    if (lead.pain) {
        total += 15;
        reasons.push('douleur explicite');
    }
    if (lead.nextAction) {
        total += 10;
        reasons.push('prochaine action definie');
    }
    if (lead.sourceQuery || lead.snippet) {
        total += 10;
        reasons.push('source de recherche tracee');
    }

    const audienceTokens = tokenizeAudience(offer?.audience || '');
    if (audienceTokens.length > 0) {
        const haystack = `${lead.company} ${lead.role} ${lead.notes || ''} ${lead.snippet || ''}`.toLowerCase();
        if (audienceTokens.some((token) => haystack.includes(token))) {
            total += 15;
            reasons.push('match partiel avec l ICP');
        }
    }

    return {
        total,
        label: total >= 75 ? 'fort' : total >= 45 ? 'moyen' : 'faible',
        reasons,
        updatedAt: timestamp()
    };
}

function createDefaultOffer(): SalesCockpitOffer {
    return {
        name: 'Leion Delivery Founding Pilot',
        audience: 'Agencies and software factories with repeated GitHub delivery work.',
        problem: 'Repeated GitHub delivery work stays manual, opaque, and hard to govern.',
        promise: 'Turn issue-to-PR, PR fix, and release gates into governed AI workflows with explicit human approval.',
        proof: 'Show 3 delivery flows running on one repo with traceable approvals and reusable run history.',
        callToAction: 'Book a 30-minute pilot scoping call on one target repository.'
    };
}

function createDefaultFunnel(): SalesCockpitFunnel {
    return {
        acquisition: 'Founder outbound to 100 qualified agencies and software factories.',
        qualification: 'Confirm repeated GitHub delivery pain, approval needs, and a repo suitable for a pilot.',
        demo: 'Run the 3 delivery workflows live on a target repo or a realistic demo repo.',
        proposal: 'Offer a fixed-fee founding pilot with one org, five repos max, and three workflows.',
        close: 'Convert the pilot into monthly governance and control-plane subscription.'
    };
}

function createDefaultTemplates(): SalesCockpitTemplate[] {
    return [
        {
            id: 'tpl-founder-email',
            name: 'Founder outbound email',
            channel: 'email',
            subject: 'Governed AI delivery workflows for your GitHub flow',
            body: [
                'Bonjour {{name}},',
                '',
                'je travaille sur Leion Delivery: un cockpit de workflows IA gouvernes pour equipes software.',
                '',
                'L idee n est pas de laisser un agent coder seul. L idee est de transformer des etapes repetitives comme Issue -> PR, PR review/fix et release gate en flows tracables avec validation humaine.',
                '',
                'Si vous avez ce type de friction dans GitHub, je peux te montrer un pilote tres concret sur un repo cible.',
                '',
                'Matth'
            ].join('\n')
        },
        {
            id: 'tpl-linkedin-followup',
            name: 'LinkedIn follow-up',
            channel: 'linkedin',
            body: [
                'Bonjour {{name}},',
                'je reviens vers toi au sujet de Leion Delivery.',
                'On aide les equipes a standardiser issue -> PR, PR fix et release gate avec validation humaine explicite.',
                'Si tu veux, je peux te montrer le flow sur un repo de demo.'
            ].join('\n')
        }
    ];
}

function createDefaultProviderAccounts(): SalesProviderAccount[] {
    return [
        {
            id: 'email',
            provider: 'email',
            label: 'Email / Gmail',
            status: 'not_connected',
            mode: 'draft_only',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['oauth connect', 'draft email', 'manual send', 'reply tracking'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        },
        {
            id: 'google_sheets',
            provider: 'google_sheets',
            label: 'Google Workspace',
            status: 'not_connected',
            mode: 'sync_only',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['oauth connect', 'sheet sync', 'drive proof locker'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        },
        {
            id: 'crm',
            provider: 'crm',
            label: 'CRM',
            status: 'not_connected',
            mode: 'sync_only',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['deal sync', 'manual update', 'contact lookup'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        },
        {
            id: 'linkedin',
            provider: 'linkedin',
            label: 'LinkedIn',
            status: 'not_connected',
            mode: 'manual_handoff',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['draft connection', 'draft follow-up', 'manual send'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        },
        {
            id: 'reddit',
            provider: 'reddit',
            label: 'Reddit',
            status: 'not_connected',
            mode: 'manual_handoff',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['draft post', 'draft reply', 'manual publish'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        },
        {
            id: 'product_hunt',
            provider: 'product_hunt',
            label: 'Product Hunt',
            status: 'not_connected',
            mode: 'manual_handoff',
            health: 'unknown',
            accountRef: '',
            endpointUrl: '',
            notes: '',
            capabilities: ['launch checklist', 'draft launch copy', 'manual publish'],
            scopes: [],
            lastValidationMessage: 'Not checked yet.',
            logs: []
        }
    ];
}

function createDefaultProviderBindings(): ProviderRoleBinding[] {
    return [
        { providerId: 'email', roles: ['draft'], notes: 'Draft Gmail only, never auto-send.' },
        { providerId: 'google_sheets', roles: ['sync', 'proof'], notes: 'Sync et preuve sur Google Workspace.' },
        { providerId: 'crm', roles: ['sync'], notes: 'Sync CRM optionnelle.' },
        { providerId: 'linkedin', roles: ['research'], notes: 'Handoff manuel.' },
        { providerId: 'reddit', roles: ['research'], notes: 'Handoff manuel.' },
        { providerId: 'product_hunt', roles: ['proof'], notes: 'Preparation de lancement seulement.' }
    ];
}

function createDefaultLeadInbox(): SalesCockpitLeadInbox {
    return {
        candidates: [],
        lastQueries: []
    };
}

function createDefaultSheetBinding(): SheetBinding {
    return {
        tabs: {
            offer: 'Offer',
            leads: 'Leads',
            proof: 'Proof',
            actions: 'Actions'
        }
    };
}

function createDefaultCampaignQueue(): CampaignQueueItem[] {
    return [];
}

function createDefaultActivityLog(productId?: string): ActivityLogEntry[] {
    return [
        {
            id: `activity-${slugify(productId || 'default')}-created`,
            timestamp: timestamp(),
            level: 'info',
            source: 'system',
            message: 'Cockpit initialise.',
            productId
        }
    ];
}

function createDefaultMcpServers(): SalesCockpitMcpServer[] {
    return [
        {
            id: 'mcp-github',
            name: 'GitHub MCP',
            transport: 'http',
            endpointUrl: 'https://api.mcp.github.com',
            args: [],
            status: 'configured',
            toolSummary: ['repo context', 'issues', 'pull requests'],
            tools: [],
            notes: 'Reference MCP surface already visible in local logs.',
            assignedProductIds: []
        }
    ];
}

export function createActivityLogEntry(
    source: ActivityLogSource,
    level: ActivityLogEntry['level'],
    message: string,
    detail?: string,
    productId?: string,
    stage?: string
): ActivityLogEntry {
    return {
        id: `activity-${Date.now()}-${slugify(source)}-${slugify(message).slice(0, 24)}`,
        timestamp: timestamp(),
        level,
        source,
        message,
        detail,
        productId,
        stage
    };
}

export function createSalesCockpitProduct(name = 'Leion Delivery'): SalesCockpitProduct {
    const slug = slugify(name);
    const productId = `product-${slug}`;
    return {
        id: productId,
        name,
        slug,
        stage: 'idea',
        notes: 'Un produit = une promesse, une interface, et 1 a 3 pipelines maximum.',
        offer: {
            ...createDefaultOffer(),
            name
        },
        funnel: createDefaultFunnel(),
        weeklyTargets: {
            outbound: 100,
            discovery: 10,
            demos: 4,
            proposals: 2
        },
        leads: [],
        tasks: [
            {
                id: `${slug}-task-build-list`,
                title: 'Build first target list',
                status: 'todo',
                kind: 'outreach',
                owner: 'founder'
            },
            {
                id: `${slug}-task-book-calls`,
                title: 'Book first discovery calls',
                status: 'todo',
                kind: 'follow_up',
                owner: 'founder'
            }
        ],
        campaigns: [
            {
                id: `${slug}-campaign-founder-email`,
                name: 'Founder outbound email',
                channel: 'email',
                goal: 'Get first discovery calls with agencies',
                templateId: 'tpl-founder-email',
                active: true
            }
        ],
        templates: createDefaultTemplates(),
        draftQueue: [],
        proofAssets: [],
        pipelinePaths: [],
        ideaPath: 'idea.md',
        implementPath: 'implement.md',
        defaultSheetUrl: '',
        leadInbox: createDefaultLeadInbox(),
        campaignQueue: createDefaultCampaignQueue(),
        sheetBinding: createDefaultSheetBinding(),
        providerBindings: createDefaultProviderBindings(),
        activityLog: createDefaultActivityLog(productId),
        mcpToolBindings: []
    };
}

function rebuildCampaignQueue(product: SalesCockpitProduct): CampaignQueueItem[] {
    const queue = new Map<string, CampaignQueueItem>();
    const now = timestamp();

    for (const lead of product.leads) {
        if (!lead.id) {
            continue;
        }
        const activeDraft = product.draftQueue.find((entry) => entry.leadId === lead.id && entry.status !== 'sent');
        let status: CampaignQueueStatus | undefined;
        if (activeDraft) {
            status = activeDraft.status === 'reviewed' ? 'reviewed' : 'drafted';
        } else if (lead.status === 'ready_for_draft') {
            status = 'ready_for_draft';
        } else if (lead.status === 'drafted') {
            status = 'drafted';
        } else if (lead.status === 'contacted' || lead.status === 'discovery' || lead.status === 'demo' || lead.status === 'proposal' || lead.status === 'pilot') {
            status = 'needs_follow_up';
        } else if (lead.dueDate && lead.dueDate < now.slice(0, 10) && lead.status !== 'won' && lead.status !== 'lost') {
            status = 'stale';
        }

        if (!status) {
            continue;
        }

        queue.set(lead.id, {
            id: `queue-${lead.id}`,
            leadId: lead.id,
            company: lead.company,
            channel: 'email',
            templateId: lead.templateId || product.templates.find((template) => template.channel === 'email')?.id,
            status,
            dueDate: lead.dueDate,
            createdAt: activeDraft?.createdAt || now,
            updatedAt: now,
            draftId: activeDraft?.draftId,
            threadId: activeDraft?.threadId,
            summary: lead.nextAction || lead.pain || lead.notes || ''
        });
    }

    return Array.from(queue.values());
}

function applyLeadScoring(product: SalesCockpitProduct): SalesCockpitProduct {
    const leads = product.leads.map((lead) => ({
        ...lead,
        domain: lead.domain || normalizeDomain(lead.profileUrl || lead.sourceUrl),
        score: computeLeadScore(lead, product.offer)
    }));
    return {
        ...product,
        leads,
        campaignQueue: rebuildCampaignQueue({
            ...product,
            leads
        })
    };
}

function snapshotFromProduct(product: SalesCockpitProduct): Pick<SalesCockpitState, 'notes' | 'offer' | 'funnel' | 'weeklyTargets' | 'leads' | 'tasks' | 'campaigns' | 'templates' | 'draftQueue' | 'proofAssets' | 'pipelinePaths' | 'ideaPath' | 'implementPath' | 'defaultSheetUrl' | 'productStage' | 'leadInbox' | 'campaignQueue' | 'sheetBinding' | 'providerBindings' | 'activityLog' | 'mcpToolBindings'> {
    const normalized = applyLeadScoring(product);
    return {
        notes: normalized.notes,
        offer: normalized.offer,
        funnel: normalized.funnel,
        weeklyTargets: normalized.weeklyTargets,
        leads: normalized.leads,
        tasks: normalized.tasks,
        campaigns: normalized.campaigns,
        templates: normalized.templates,
        draftQueue: normalized.draftQueue,
        proofAssets: normalized.proofAssets,
        pipelinePaths: normalized.pipelinePaths,
        ideaPath: normalized.ideaPath,
        implementPath: normalized.implementPath,
        defaultSheetUrl: normalized.defaultSheetUrl || normalized.sheetBinding.sheetUrl,
        productStage: normalized.stage,
        leadInbox: normalized.leadInbox,
        campaignQueue: normalized.campaignQueue,
        sheetBinding: normalized.sheetBinding,
        providerBindings: normalized.providerBindings,
        activityLog: normalized.activityLog,
        mcpToolBindings: normalized.mcpToolBindings
    };
}

function applySnapshotToProduct(product: SalesCockpitProduct, state: Partial<SalesCockpitState>): SalesCockpitProduct {
    const sheetBinding = state.sheetBinding ?? product.sheetBinding;
    return applyLeadScoring({
        ...product,
        notes: state.notes ?? product.notes,
        offer: state.offer ?? product.offer,
        funnel: state.funnel ?? product.funnel,
        weeklyTargets: state.weeklyTargets ?? product.weeklyTargets,
        leads: state.leads ?? product.leads,
        tasks: state.tasks ?? product.tasks,
        campaigns: state.campaigns ?? product.campaigns,
        templates: state.templates ?? product.templates,
        draftQueue: state.draftQueue ?? product.draftQueue,
        proofAssets: state.proofAssets ?? product.proofAssets,
        pipelinePaths: state.pipelinePaths ?? product.pipelinePaths,
        ideaPath: state.ideaPath ?? product.ideaPath,
        implementPath: state.implementPath ?? product.implementPath,
        defaultSheetUrl: state.defaultSheetUrl ?? sheetBinding.sheetUrl ?? product.defaultSheetUrl,
        stage: state.productStage ?? product.stage,
        leadInbox: state.leadInbox ?? product.leadInbox,
        campaignQueue: state.campaignQueue ?? product.campaignQueue,
        sheetBinding: {
            ...sheetBinding,
            sheetUrl: state.defaultSheetUrl ?? sheetBinding.sheetUrl ?? product.defaultSheetUrl
        },
        providerBindings: state.providerBindings ?? product.providerBindings,
        activityLog: state.activityLog ?? product.activityLog,
        mcpToolBindings: state.mcpToolBindings ?? product.mcpToolBindings
    });
}

function hydrateActiveProduct(state: SalesCockpitState): SalesCockpitState {
    const products = state.products.length > 0 ? state.products.map((product) => applyLeadScoring(product)) : [createSalesCockpitProduct()];
    const activeProduct = products.find((product) => product.id === state.activeProductId) || products[0];
    if (!activeProduct) {
        const fallback = createSalesCockpitProduct();
        return {
            ...createDefaultSalesCockpitState(),
            activeProductId: fallback.id,
            products: [fallback],
            ...snapshotFromProduct(fallback)
        };
    }
    return {
        ...state,
        products,
        activeProductId: activeProduct.id,
        ...snapshotFromProduct(activeProduct)
    };
}

function syncActiveProduct(state: SalesCockpitState): SalesCockpitState {
    const products = state.products.length > 0 ? [...state.products] : [createSalesCockpitProduct()];
    const activeProductId = products.some((product) => product.id === state.activeProductId)
        ? state.activeProductId
        : products[0].id;
    const nextProducts = products.map((product) =>
        product.id === activeProductId
            ? applySnapshotToProduct(product, state)
            : applyLeadScoring(product)
    );
    return hydrateActiveProduct({
        ...state,
        activeProductId,
        products: nextProducts
    });
}

export function getActiveSalesCockpitProduct(state: SalesCockpitState): SalesCockpitProduct {
    const normalized = normalizeSalesCockpitState(state);
    return normalized.products.find((product) => product.id === normalized.activeProductId) || normalized.products[0];
}

export function withActiveSalesCockpitProduct(
    state: SalesCockpitState,
    updater: (product: SalesCockpitProduct) => SalesCockpitProduct
): SalesCockpitState {
    const normalized = normalizeSalesCockpitState(state);
    const current = getActiveSalesCockpitProduct(normalized);
    const nextProduct = applyLeadScoring(updater(current));
    const products = normalized.products.map((product) => product.id === nextProduct.id ? nextProduct : product);
    return hydrateActiveProduct({
        ...normalized,
        products,
        activeProductId: nextProduct.id
    });
}

export function appendActivityLog(state: SalesCockpitState, entry: ActivityLogEntry, productId?: string): SalesCockpitState {
    const normalized = normalizeSalesCockpitState(state);
    const targetId = productId || normalized.activeProductId;
    const products = normalized.products.map((product) => product.id === targetId
        ? {
            ...product,
            activityLog: [entry, ...product.activityLog.filter((log) => log.id !== entry.id)].slice(0, 80)
        }
        : product);
    return hydrateActiveProduct({
        ...normalized,
        products
    });
}

export function createDefaultSalesCockpitState(): SalesCockpitState {
    const product = createSalesCockpitProduct('Leion Delivery');
    return {
        version: FILE_VERSION,
        lastUpdatedAt: timestamp(),
        activeProductId: product.id,
        products: [product],
        mcpServers: createDefaultMcpServers(),
        providerAccounts: createDefaultProviderAccounts(),
        ...snapshotFromProduct(product)
    };
}

function sanitizeLead(raw: any, offer?: SalesCockpitOffer): SalesCockpitLead | null {
    const company = String(raw?.company || '').trim();
    if (!company) return null;
    const id = String(raw?.id || company.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
    const status = String(raw?.status || '').trim() === 'target'
        ? 'reviewed'
        : (SALES_LEAD_STAGES.includes(raw?.status) ? raw.status : 'reviewed');
    const lead: SalesCockpitLead = {
        id,
        company,
        contactName: String(raw?.contactName || '').trim(),
        role: String(raw?.role || '').trim(),
        email: raw?.email ? String(raw.email).trim() : undefined,
        status,
        pain: String(raw?.pain || '').trim(),
        nextAction: String(raw?.nextAction || '').trim(),
        owner: String(raw?.owner || 'founder').trim() || 'founder',
        dueDate: raw?.dueDate ? String(raw.dueDate).trim() : undefined,
        profileUrl: raw?.profileUrl ? String(raw.profileUrl).trim() : undefined,
        notes: raw?.notes ? String(raw.notes) : undefined,
        domain: raw?.domain ? String(raw.domain).trim() : normalizeDomain(raw?.profileUrl || raw?.sourceUrl),
        sourceUrl: raw?.sourceUrl ? String(raw.sourceUrl).trim() : (raw?.profileUrl ? String(raw.profileUrl).trim() : undefined),
        sourceQuery: raw?.sourceQuery ? String(raw.sourceQuery).trim() : undefined,
        snippet: raw?.snippet ? String(raw.snippet).trim() : undefined,
        confidence: typeof raw?.confidence === 'number' ? raw.confidence : undefined,
        enrichment: raw?.enrichment ? {
            status: LEAD_ENRICHMENT_STATUSES.includes(raw.enrichment?.status) ? raw.enrichment.status : 'not_started',
            attempts: Math.max(0, Number(raw.enrichment?.attempts || 0)),
            lastAttemptAt: raw.enrichment?.lastAttemptAt ? String(raw.enrichment.lastAttemptAt).trim() : undefined,
            lastSuccessAt: raw.enrichment?.lastSuccessAt ? String(raw.enrichment.lastSuccessAt).trim() : undefined,
            error: raw.enrichment?.error ? String(raw.enrichment.error) : undefined,
            sources: Array.isArray(raw.enrichment?.sources) ? raw.enrichment.sources.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : []
        } : undefined,
        manualFields: Array.isArray(raw?.manualFields) ? raw.manualFields.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        lastContactedAt: raw?.lastContactedAt ? String(raw.lastContactedAt).trim() : undefined,
        templateId: raw?.templateId ? String(raw.templateId).trim() : undefined
    };
    return {
        ...lead,
        score: raw?.score ? {
            total: Number(raw.score?.total || 0),
            label: ['faible', 'moyen', 'fort'].includes(raw.score?.label) ? raw.score.label : 'faible',
            reasons: Array.isArray(raw.score?.reasons) ? raw.score.reasons.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
            updatedAt: String(raw.score?.updatedAt || timestamp()).trim()
        } : computeLeadScore(lead, offer)
    };
}

function sanitizeCandidate(raw: any): LeadCandidateRecord | null {
    const company = String(raw?.company || '').trim();
    const sourceUrl = String(raw?.sourceUrl || raw?.profileUrl || '').trim();
    if (!company || !sourceUrl) return null;
    return {
        id: String(raw?.id || `candidate-${slugify(company)}-${slugify(sourceUrl)}`).trim(),
        company,
        domain: raw?.domain ? String(raw.domain).trim() : normalizeDomain(sourceUrl),
        sourceUrl,
        sourceQuery: String(raw?.sourceQuery || '').trim(),
        snippet: String(raw?.snippet || raw?.notes || '').trim(),
        confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0.5))),
        status: LEAD_CANDIDATE_STATUSES.includes(raw?.status) ? raw.status : 'candidate',
        discoveredAt: String(raw?.discoveredAt || timestamp()).trim(),
        notes: raw?.notes ? String(raw.notes) : undefined
    };
}

function sanitizeTask(raw: any): SalesCockpitTask | null {
    const title = String(raw?.title || '').trim();
    if (!title) return null;
    const kinds: SalesTaskKind[] = ['outreach', 'follow_up', 'demo', 'proposal', 'proof', 'friction'];
    return {
        id: String(raw?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim(),
        title,
        status: raw?.status === 'done' ? 'done' : 'todo',
        kind: kinds.includes(raw?.kind) ? raw.kind : 'outreach',
        owner: String(raw?.owner || 'founder').trim() || 'founder',
        dueDate: raw?.dueDate ? String(raw.dueDate).trim() : undefined,
        leadId: raw?.leadId ? String(raw.leadId).trim() : undefined,
        detail: raw?.detail ? String(raw.detail) : undefined,
        sourceRef: raw?.sourceRef ? String(raw.sourceRef).trim() : undefined
    };
}

function sanitizeCampaign(raw: any): SalesCockpitCampaign | null {
    const name = String(raw?.name || '').trim();
    if (!name) return null;
    return {
        id: String(raw?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim(),
        name,
        channel: raw?.channel === 'linkedin' ? 'linkedin' : 'email',
        goal: String(raw?.goal || '').trim(),
        templateId: String(raw?.templateId || '').trim(),
        active: raw?.active !== false
    };
}

function sanitizeTemplate(raw: any): SalesCockpitTemplate | null {
    const name = String(raw?.name || '').trim();
    const body = String(raw?.body || '').trim();
    if (!name || !body) return null;
    return {
        id: String(raw?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim(),
        name,
        channel: raw?.channel === 'linkedin' ? 'linkedin' : 'email',
        subject: raw?.subject ? String(raw.subject).trim() : undefined,
        body
    };
}

function sanitizeProviderAccount(raw: any, fallback: SalesProviderAccount): SalesProviderAccount {
    const provider = SALES_PROVIDER_IDS.includes(raw?.provider) ? raw.provider : fallback.provider;
    const status = SALES_PROVIDER_STATUSES.includes(raw?.status) ? raw.status : fallback.status;
    const mode = SALES_PROVIDER_MODES.includes(raw?.mode) ? raw.mode : fallback.mode;
    const capabilities = Array.isArray(raw?.capabilities)
        ? raw.capabilities.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : fallback.capabilities;
    const scopes = Array.isArray(raw?.scopes)
        ? raw.scopes.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : fallback.scopes;
    const logs = Array.isArray(raw?.logs)
        ? raw.logs.map((entry: any, index: number) => ({
            id: String(entry?.id || `${fallback.id}-log-${index}`).trim(),
            timestamp: String(entry?.timestamp || timestamp()).trim(),
            level: ['info', 'success', 'warning', 'error'].includes(raw?.logs?.[index]?.level) ? raw.logs[index].level : 'info',
            message: String(entry?.message || '').trim(),
            detail: entry?.detail ? String(entry.detail) : undefined
        })).filter((entry: SalesProviderLogEntry) => !!entry.message)
        : fallback.logs;

    return {
        id: String(raw?.id || fallback.id).trim() || fallback.id,
        provider,
        label: String(raw?.label || fallback.label).trim() || fallback.label,
        status,
        mode,
        health: SALES_PROVIDER_HEALTH.includes(raw?.health) ? raw.health : fallback.health,
        accountRef: raw?.accountRef ? String(raw.accountRef).trim() : fallback.accountRef,
        endpointUrl: raw?.endpointUrl ? String(raw.endpointUrl).trim() : fallback.endpointUrl,
        notes: raw?.notes ? String(raw.notes) : fallback.notes,
        capabilities,
        scopes,
        lastValidatedAt: raw?.lastValidatedAt ? String(raw.lastValidatedAt).trim() : fallback.lastValidatedAt
        ,
        lastValidationMessage: raw?.lastValidationMessage ? String(raw.lastValidationMessage) : fallback.lastValidationMessage,
        logs
    };
}

function sanitizeOffer(raw: any, defaults: SalesCockpitOffer): SalesCockpitOffer {
    return {
        name: String(raw?.name || defaults.name).trim() || defaults.name,
        audience: String(raw?.audience || defaults.audience).trim() || defaults.audience,
        problem: String(raw?.problem || defaults.problem).trim() || defaults.problem,
        promise: String(raw?.promise || defaults.promise).trim() || defaults.promise,
        proof: String(raw?.proof || defaults.proof).trim() || defaults.proof,
        callToAction: String(raw?.callToAction || defaults.callToAction).trim() || defaults.callToAction
    };
}

function sanitizeFunnel(raw: any, defaults: SalesCockpitFunnel): SalesCockpitFunnel {
    return {
        acquisition: String(raw?.acquisition || defaults.acquisition).trim() || defaults.acquisition,
        qualification: String(raw?.qualification || defaults.qualification).trim() || defaults.qualification,
        demo: String(raw?.demo || defaults.demo).trim() || defaults.demo,
        proposal: String(raw?.proposal || defaults.proposal).trim() || defaults.proposal,
        close: String(raw?.close || defaults.close).trim() || defaults.close
    };
}

function sanitizeProofAsset(raw: any): SalesCockpitProofAsset | null {
    const title = String(raw?.title || '').trim();
    if (!title) return null;
    return {
        id: String(raw?.id || slugify(title)).trim(),
        title,
        kind: PROOF_ASSET_KINDS.includes(raw?.kind) ? raw.kind : 'doc',
        status: PROOF_ASSET_STATUSES.includes(raw?.status) ? raw.status : 'draft',
        summary: String(raw?.summary || '').trim(),
        sourceLabel: raw?.sourceLabel ? String(raw.sourceLabel).trim() : undefined,
        sourceRef: raw?.sourceRef ? String(raw.sourceRef).trim() : undefined,
        createdAt: raw?.createdAt ? String(raw.createdAt).trim() : timestamp()
    };
}

function sanitizeDraftQueueItem(raw: any): SalesCockpitDraftQueueItem | null {
    const subject = String(raw?.subject || '').trim();
    const to = String(raw?.to || '').trim();
    if (!subject && !to) {
        return null;
    }
    return {
        id: String(raw?.id || slugify(`${to}-${subject}`)).trim(),
        provider: 'gmail',
        status: ['drafted', 'reviewed', 'sent'].includes(raw?.status) ? raw.status : 'drafted',
        to,
        subject,
        bodyPreview: String(raw?.bodyPreview || '').trim(),
        createdAt: raw?.createdAt ? String(raw.createdAt).trim() : timestamp(),
        leadId: raw?.leadId ? String(raw.leadId).trim() : undefined,
        draftId: raw?.draftId ? String(raw.draftId).trim() : undefined,
        threadId: raw?.threadId ? String(raw.threadId).trim() : undefined
    };
}

function sanitizeCampaignQueueItem(raw: any): CampaignQueueItem | null {
    const leadId = String(raw?.leadId || '').trim();
    if (!leadId) return null;
    return {
        id: String(raw?.id || `queue-${leadId}`).trim(),
        leadId,
        company: String(raw?.company || '').trim(),
        channel: raw?.channel === 'linkedin' ? 'linkedin' : 'email',
        templateId: raw?.templateId ? String(raw.templateId).trim() : undefined,
        status: CAMPAIGN_QUEUE_STATUSES.includes(raw?.status) ? raw.status : 'ready_for_draft',
        dueDate: raw?.dueDate ? String(raw.dueDate).trim() : undefined,
        createdAt: String(raw?.createdAt || timestamp()).trim(),
        updatedAt: String(raw?.updatedAt || timestamp()).trim(),
        draftId: raw?.draftId ? String(raw.draftId).trim() : undefined,
        threadId: raw?.threadId ? String(raw.threadId).trim() : undefined,
        summary: raw?.summary ? String(raw.summary) : undefined
    };
}

function sanitizeLeadInbox(raw: any): SalesCockpitLeadInbox {
    const defaults = createDefaultLeadInbox();
    return {
        candidates: Array.isArray(raw?.candidates) ? raw.candidates.map(sanitizeCandidate).filter(Boolean) as LeadCandidateRecord[] : defaults.candidates,
        lastResearchAt: raw?.lastResearchAt ? String(raw.lastResearchAt).trim() : undefined,
        lastQueries: Array.isArray(raw?.lastQueries) ? raw.lastQueries.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : defaults.lastQueries,
        lastResearchSummary: raw?.lastResearchSummary ? String(raw.lastResearchSummary) : undefined
    };
}

function sanitizeSheetBinding(raw: any, defaultSheetUrl?: string): SheetBinding {
    const fallback = createDefaultSheetBinding();
    const tabs = raw?.tabs || {};
    return {
        sheetUrl: raw?.sheetUrl ? String(raw.sheetUrl).trim() : (defaultSheetUrl ? String(defaultSheetUrl).trim() : undefined),
        spreadsheetId: raw?.spreadsheetId ? String(raw.spreadsheetId).trim() : undefined,
        tabs: {
            offer: String(tabs.offer || fallback.tabs.offer).trim() || fallback.tabs.offer,
            leads: String(tabs.leads || fallback.tabs.leads).trim() || fallback.tabs.leads,
            proof: String(tabs.proof || fallback.tabs.proof).trim() || fallback.tabs.proof,
            actions: String(tabs.actions || fallback.tabs.actions).trim() || fallback.tabs.actions
        },
        lastSyncedAt: raw?.lastSyncedAt ? String(raw.lastSyncedAt).trim() : undefined
    };
}

function sanitizeProviderBinding(raw: any): ProviderRoleBinding | null {
    const providerId = SALES_PROVIDER_IDS.includes(raw?.providerId) ? raw.providerId : undefined;
    if (!providerId) return null;
    return {
        providerId,
        roles: Array.isArray(raw?.roles)
            ? raw.roles.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => SALES_PROVIDER_ROLES.includes(entry as SalesProviderRole)) as SalesProviderRole[]
            : [],
        notes: raw?.notes ? String(raw.notes) : undefined,
        lastUsedAt: raw?.lastUsedAt ? String(raw.lastUsedAt).trim() : undefined
    };
}

function sanitizeActivityLogEntry(raw: any, productId?: string): ActivityLogEntry | null {
    const message = String(raw?.message || '').trim();
    if (!message) return null;
    return {
        id: String(raw?.id || `activity-${slugify(message)}-${Date.now()}`).trim(),
        timestamp: String(raw?.timestamp || timestamp()).trim(),
        level: ['info', 'success', 'warning', 'error'].includes(raw?.level) ? raw.level : 'info',
        source: ['research', 'enrichment', 'sheet', 'drafts', 'provider', 'product', 'mcp', 'system'].includes(raw?.source) ? raw.source : 'system',
        message,
        detail: raw?.detail ? String(raw.detail) : undefined,
        productId: raw?.productId ? String(raw.productId).trim() : productId,
        stage: raw?.stage ? String(raw.stage).trim() : undefined
    };
}

function sanitizeMcpToolBinding(raw: any): McpToolBinding | null {
    const serverId = String(raw?.serverId || '').trim();
    const toolName = String(raw?.toolName || '').trim();
    if (!serverId || !toolName) return null;
    return {
        serverId,
        toolName,
        roles: Array.isArray(raw?.roles)
            ? raw.roles.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => SALES_PROVIDER_ROLES.includes(entry as SalesProviderRole)) as SalesProviderRole[]
            : [],
        notes: raw?.notes ? String(raw.notes) : undefined
    };
}

function sanitizeProduct(raw: any, fallbackName: string, fallbackId?: string): SalesCockpitProduct {
    const fallback = createSalesCockpitProduct(fallbackName);
    const name = String(raw?.name || fallbackName || fallback.name).trim() || fallback.name;
    const slug = String(raw?.slug || slugify(name)).trim() || slugify(name);
    const id = String(raw?.id || fallbackId || `product-${slug}`).trim() || `product-${slug}`;
    const offer = sanitizeOffer(raw?.offer, {
        ...fallback.offer,
        name
    });
    const leads = Array.isArray(raw?.leads) ? raw.leads.map((entry: any) => sanitizeLead(entry, offer)).filter(Boolean) as SalesCockpitLead[] : fallback.leads;
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) as SalesCockpitTask[] : fallback.tasks;
    const campaigns = Array.isArray(raw?.campaigns) ? raw.campaigns.map(sanitizeCampaign).filter(Boolean) as SalesCockpitCampaign[] : fallback.campaigns;
    const templates = Array.isArray(raw?.templates) ? raw.templates.map(sanitizeTemplate).filter(Boolean) as SalesCockpitTemplate[] : fallback.templates;
    const draftQueue = Array.isArray(raw?.draftQueue) ? raw.draftQueue.map(sanitizeDraftQueueItem).filter(Boolean) as SalesCockpitDraftQueueItem[] : fallback.draftQueue;
    const proofAssets = Array.isArray(raw?.proofAssets) ? raw.proofAssets.map(sanitizeProofAsset).filter(Boolean) as SalesCockpitProofAsset[] : fallback.proofAssets;
    const pipelinePaths = Array.isArray(raw?.pipelinePaths)
        ? raw.pipelinePaths.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : fallback.pipelinePaths;
    const leadInbox = sanitizeLeadInbox(raw?.leadInbox);
    const sheetBinding = sanitizeSheetBinding(raw?.sheetBinding, raw?.defaultSheetUrl);
    const providerBindings = Array.isArray(raw?.providerBindings)
        ? raw.providerBindings.map(sanitizeProviderBinding).filter(Boolean) as ProviderRoleBinding[]
        : fallback.providerBindings;
    const activityLog = Array.isArray(raw?.activityLog)
        ? raw.activityLog.map((entry: any) => sanitizeActivityLogEntry(entry, id)).filter(Boolean) as ActivityLogEntry[]
        : createDefaultActivityLog(id);
    const mcpToolBindings = Array.isArray(raw?.mcpToolBindings)
        ? raw.mcpToolBindings.map(sanitizeMcpToolBinding).filter(Boolean) as McpToolBinding[]
        : [];

    return applyLeadScoring({
        id,
        name,
        slug,
        stage: SALES_PRODUCT_STAGES.includes(raw?.stage) ? raw.stage : fallback.stage,
        notes: String(raw?.notes || fallback.notes),
        offer,
        funnel: sanitizeFunnel(raw?.funnel, fallback.funnel),
        weeklyTargets: {
            outbound: Number(raw?.weeklyTargets?.outbound || fallback.weeklyTargets.outbound),
            discovery: Number(raw?.weeklyTargets?.discovery || fallback.weeklyTargets.discovery),
            demos: Number(raw?.weeklyTargets?.demos || fallback.weeklyTargets.demos),
            proposals: Number(raw?.weeklyTargets?.proposals || fallback.weeklyTargets.proposals)
        },
        leads,
        tasks,
        campaigns,
        templates,
        draftQueue,
        proofAssets,
        pipelinePaths,
        ideaPath: raw?.ideaPath ? String(raw.ideaPath).trim() : fallback.ideaPath,
        implementPath: raw?.implementPath ? String(raw.implementPath).trim() : fallback.implementPath,
        defaultSheetUrl: raw?.defaultSheetUrl ? String(raw.defaultSheetUrl).trim() : sheetBinding.sheetUrl || fallback.defaultSheetUrl,
        leadInbox,
        campaignQueue: Array.isArray(raw?.campaignQueue) ? raw.campaignQueue.map(sanitizeCampaignQueueItem).filter(Boolean) as CampaignQueueItem[] : createDefaultCampaignQueue(),
        sheetBinding: {
            ...sheetBinding,
            sheetUrl: sheetBinding.sheetUrl || raw?.defaultSheetUrl || fallback.defaultSheetUrl
        },
        providerBindings: providerBindings.length > 0 ? providerBindings : fallback.providerBindings,
        activityLog: activityLog.length > 0 ? activityLog : createDefaultActivityLog(id),
        mcpToolBindings
    });
}

function sanitizeMcpServer(raw: any): SalesCockpitMcpServer | null {
    const name = String(raw?.name || '').trim();
    if (!name) return null;
    const tools = Array.isArray(raw?.tools)
        ? raw.tools.map((tool: any) => {
            const toolName = String(tool?.name || '').trim();
            if (!toolName) return null;
            return {
                name: toolName,
                title: tool?.title ? String(tool.title).trim() : undefined,
                description: tool?.description ? String(tool.description).trim() : undefined,
                inputSchemaSummary: tool?.inputSchemaSummary ? String(tool.inputSchemaSummary).trim() : undefined
            } as SalesCockpitMcpTool;
        }).filter(Boolean) as SalesCockpitMcpTool[]
        : [];
    return {
        id: String(raw?.id || slugify(name)).trim(),
        name,
        transport: MCP_TRANSPORTS.includes(raw?.transport) ? raw.transport : 'http',
        endpointUrl: raw?.endpointUrl ? String(raw.endpointUrl).trim() : undefined,
        command: raw?.command ? String(raw.command).trim() : undefined,
        args: Array.isArray(raw?.args) ? raw.args.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        status: MCP_SERVER_STATUSES.includes(raw?.status) ? raw.status : 'not_configured',
        toolSummary: Array.isArray(raw?.toolSummary) ? raw.toolSummary.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        tools,
        notes: raw?.notes ? String(raw.notes) : undefined,
        assignedProductIds: Array.isArray(raw?.assignedProductIds) ? raw.assignedProductIds.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        lastDiscoveredAt: raw?.lastDiscoveredAt ? String(raw.lastDiscoveredAt).trim() : undefined,
        lastDiscoveryError: raw?.lastDiscoveryError ? String(raw.lastDiscoveryError) : undefined
    };
}

export function coerceSalesCockpitState(raw: any): SalesCockpitState {
    const defaults = createDefaultSalesCockpitState();
    const providerDefaults = defaults.providerAccounts;
    const incomingProviders = Array.isArray(raw?.providerAccounts) ? raw.providerAccounts : [];
    const providerAccounts = providerDefaults.map((fallback) => {
        const candidate = incomingProviders.find((entry: any) => {
            const id = String(entry?.id || entry?.provider || '').trim();
            return id === fallback.id || id === fallback.provider;
        });
        return sanitizeProviderAccount(candidate, fallback);
    });

    const incomingProducts = Array.isArray(raw?.products) && raw.products.length > 0
        ? raw.products.map((product: any, index: number) => sanitizeProduct(product, product?.name || `Product ${index + 1}`))
        : [sanitizeProduct({
            name: raw?.offer?.name || raw?.name || defaults.offer.name,
            stage: raw?.productStage || 'idea',
            notes: raw?.notes,
            offer: raw?.offer,
            funnel: raw?.funnel,
            weeklyTargets: raw?.weeklyTargets,
            leads: raw?.leads,
            tasks: raw?.tasks,
            campaigns: raw?.campaigns,
            templates: raw?.templates,
            draftQueue: raw?.draftQueue,
            proofAssets: raw?.proofAssets,
            pipelinePaths: raw?.pipelinePaths,
            ideaPath: raw?.ideaPath,
            implementPath: raw?.implementPath,
            defaultSheetUrl: raw?.defaultSheetUrl,
            leadInbox: raw?.leadInbox,
            campaignQueue: raw?.campaignQueue,
            sheetBinding: raw?.sheetBinding,
            providerBindings: raw?.providerBindings,
            activityLog: raw?.activityLog,
            mcpToolBindings: raw?.mcpToolBindings
        }, raw?.offer?.name || 'Leion Delivery')];

    const activeProductId = String(raw?.activeProductId || incomingProducts[0]?.id || defaults.activeProductId).trim();
    const mcpServersRaw = Array.isArray(raw?.mcpServers) ? raw.mcpServers.map(sanitizeMcpServer).filter(Boolean) as SalesCockpitMcpServer[] : defaults.mcpServers;

    const activeProduct = incomingProducts.find((product: SalesCockpitProduct) => product.id === activeProductId) || incomingProducts[0] || createSalesCockpitProduct();
    const base: SalesCockpitState = {
        version: FILE_VERSION,
        lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
        activeProductId,
        products: incomingProducts,
        mcpServers: mcpServersRaw.length > 0 ? mcpServersRaw : defaults.mcpServers,
        providerAccounts,
        ...snapshotFromProduct(activeProduct)
    };

    return hydrateActiveProduct(base);
}

export function normalizeSalesCockpitState(raw: any): SalesCockpitState {
    const hydrated = coerceSalesCockpitState(raw);
    return syncActiveProduct(hydrated);
}

export function selectSalesCockpitProduct(state: SalesCockpitState, productId: string): SalesCockpitState {
    return hydrateActiveProduct({
        ...normalizeSalesCockpitState(state),
        activeProductId: productId
    });
}

export async function readSalesCockpitFromWorkspace(): Promise<SalesCockpitState> {
    const uri = getSalesCockpitUri();
    if (!uri) return createDefaultSalesCockpitState();
    if (!(await fileExists(uri))) return createDefaultSalesCockpitState();
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return coerceSalesCockpitState(JSON.parse(text));
    } catch {
        return createDefaultSalesCockpitState();
    }
}

export async function writeSalesCockpitToWorkspace(state: SalesCockpitState): Promise<SalesCockpitState> {
    const uri = getSalesCockpitUri();
    if (!uri) {
        throw new Error('No workspace folder open.');
    }
    await ensureParentFolder(uri);
    const next = normalizeSalesCockpitState({ ...state, lastUpdatedAt: timestamp() });
    const text = JSON.stringify(next, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    return next;
}

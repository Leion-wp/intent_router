export const SALES_LEAD_STAGES = ['candidate', 'reviewed', 'enriched', 'ready_for_draft', 'drafted', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'] as const;
export const SALES_TASK_KINDS = ['outreach', 'follow_up', 'demo', 'proposal', 'proof', 'friction'] as const;
export const SALES_CHANNELS = ['email', 'linkedin'] as const;
export const SALES_PROVIDER_IDS = ['email', 'google_sheets', 'crm', 'linkedin', 'reddit', 'product_hunt'] as const;
export const SALES_PROVIDER_STATUSES = ['not_connected', 'configured', 'connected'] as const;
export const SALES_PROVIDER_MODES = ['draft_only', 'manual_handoff', 'sync_only'] as const;
export const SALES_PROVIDER_HEALTH = ['unknown', 'healthy', 'warning', 'error'] as const;
export const SALES_PRODUCT_STAGES = ['idea', 'offer', 'outbound', 'pilot', 'won'] as const;
export const PROOF_ASSET_KINDS = ['run', 'doc', 'metric', 'snippet', 'screenshot'] as const;
export const PROOF_ASSET_STATUSES = ['draft', 'ready'] as const;
export const MCP_TRANSPORTS = ['http', 'sse', 'stdio'] as const;
export const MCP_SERVER_STATUSES = ['not_configured', 'configured', 'connected'] as const;
export const SALES_DRAFT_STATUSES = ['drafted', 'reviewed', 'sent'] as const;
export const LEAD_CANDIDATE_STATUSES = ['candidate', 'reviewed', 'rejected'] as const;
export const LEAD_ENRICHMENT_STATUSES = ['not_started', 'partial', 'complete', 'failed'] as const;
export const CAMPAIGN_QUEUE_STATUSES = ['ready_for_draft', 'drafted', 'reviewed', 'needs_follow_up', 'stale'] as const;
export const SALES_PROVIDER_ROLES = ['research', 'enrich', 'sync', 'draft', 'proof'] as const;

export type SalesLeadStage = typeof SALES_LEAD_STAGES[number];
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = typeof SALES_TASK_KINDS[number];
export type SalesChannel = typeof SALES_CHANNELS[number];
export type SalesProviderId = typeof SALES_PROVIDER_IDS[number];
export type SalesProviderStatus = typeof SALES_PROVIDER_STATUSES[number];
export type SalesProviderMode = typeof SALES_PROVIDER_MODES[number];
export type SalesProviderHealth = typeof SALES_PROVIDER_HEALTH[number];
export type SalesProductStage = typeof SALES_PRODUCT_STAGES[number];
export type ProofAssetKind = typeof PROOF_ASSET_KINDS[number];
export type ProofAssetStatus = typeof PROOF_ASSET_STATUSES[number];
export type McpTransport = typeof MCP_TRANSPORTS[number];
export type McpServerStatus = typeof MCP_SERVER_STATUSES[number];
export type SalesDraftStatus = typeof SALES_DRAFT_STATUSES[number];
export type LeadCandidateStatus = typeof LEAD_CANDIDATE_STATUSES[number];
export type LeadEnrichmentStatus = typeof LEAD_ENRICHMENT_STATUSES[number];
export type CampaignQueueStatus = typeof CAMPAIGN_QUEUE_STATUSES[number];
export type SalesProviderRole = typeof SALES_PROVIDER_ROLES[number];

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

export type SalesProviderDefinition = {
  id: SalesProviderId;
  title: string;
  description: string;
  accountRefLabel: string;
  accountRefPlaceholder: string;
  endpointLabel: string;
  endpointPlaceholder: string;
  recommendedMode: SalesProviderMode;
  capabilities: string[];
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
  source: 'research' | 'enrichment' | 'sheet' | 'drafts' | 'provider' | 'product' | 'mcp' | 'system';
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

export type SalesCockpitMetric = {
  key: 'outbound' | 'discovery' | 'demos' | 'proposals';
  label: string;
  current: number;
  target: number;
};

export type SalesCockpitActionItem = {
  id: string;
  title: string;
  detail: string;
  kind: 'product' | 'provider' | 'lead' | 'proof' | 'delivery';
};

export type SalesCockpitReadiness = {
  score: number;
  label: string;
  blockers: string[];
  strengths: string[];
  nextMilestone: string;
};

export type SalesCockpitRecommendation = {
  id: string;
  title: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  module: 'home' | 'products' | 'prospects' | 'contact' | 'providers' | 'proof';
  cta: string;
};

export type SalesCockpitLeadSignals = {
  totalOpen: number;
  readyForDraft: number;
  missingEmail: number;
  stale: number;
  missingPain: number;
  missingNextAction: number;
};

export type SalesCockpitFrictionSummary = {
  total: number;
  byType: Record<'product' | 'offer' | 'sales' | 'cockpit' | 'pipeline' | 'general', number>;
};

export type SalesCockpitLeadGenerationBrief = {
  icpSummary: string;
  searchQueries: string[];
  outreachAngles: string[];
  qualificationChecklist: string[];
};

export type SalesCockpitModel = {
  activeProduct: SalesCockpitProduct;
  metrics: SalesCockpitMetric[];
  stageCounts: Record<SalesLeadStage, number>;
  openTasks: SalesCockpitTask[];
  overdueTasks: number;
  activeCampaigns: SalesCockpitCampaign[];
  openLeads: SalesCockpitLead[];
  leadInbox: SalesCockpitLeadInbox;
  campaignQueue: CampaignQueueItem[];
  activityLog: ActivityLogEntry[];
  providerSummary: {
    total: number;
    connected: number;
    configured: number;
    draftOnly: number;
    unhealthy: number;
  };
  productSummary: {
    total: number;
    activeName: string;
    activeStage: SalesProductStage;
  };
  proofSummary: {
    total: number;
    ready: number;
  };
  mcpSummary: {
    total: number;
    ready: number;
    discoveredTools: number;
  };
  readiness: SalesCockpitReadiness;
  recommendations: SalesCockpitRecommendation[];
  leadSignals: SalesCockpitLeadSignals;
  frictionSummary: SalesCockpitFrictionSummary;
  leadGenerationBrief: SalesCockpitLeadGenerationBrief;
  actionCenter: SalesCockpitActionItem[];
};

export const SALES_PROVIDER_DEFINITIONS: SalesProviderDefinition[] = [
  {
    id: 'email',
    title: 'Email / Gmail',
    description: 'Gmail OAuth first, SMTP fallback second. Keep drafts and manual send before any stronger automation.',
    accountRefLabel: 'Address',
    accountRefPlaceholder: 'matth.schwaiger@gmail.com',
    endpointLabel: 'Compose surface',
    endpointPlaceholder: 'https://mail.google.com/ or smtp://...',
    recommendedMode: 'draft_only',
    capabilities: ['oauth connect', 'draft email', 'manual send', 'reply tracking']
  },
  {
    id: 'google_sheets',
    title: 'Google Workspace',
    description: 'OAuth-based access to Google Sheets and Drive proof assets. Gmail comes next as a dedicated connector.',
    accountRefLabel: 'Google account',
    accountRefPlaceholder: 'matth.schwaiger@gmail.com',
    endpointLabel: 'Default Sheet / Drive URL',
    endpointPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
    recommendedMode: 'sync_only',
    capabilities: ['oauth connect', 'sheet sync', 'drive proof locker']
  },
  {
    id: 'crm',
    title: 'CRM',
    description: 'Keep deals and accounts aligned with a CRM without building a full automation loop yet.',
    accountRefLabel: 'Workspace',
    accountRefPlaceholder: 'HubSpot / Pipedrive workspace',
    endpointLabel: 'CRM URL',
    endpointPlaceholder: 'https://app.hubspot.com/...',
    recommendedMode: 'sync_only',
    capabilities: ['deal sync', 'manual update', 'contact lookup']
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    description: 'Prepare connection requests and follow-ups, then hand off manually.',
    accountRefLabel: 'Handle',
    accountRefPlaceholder: 'linkedin.com/in/your-profile',
    endpointLabel: 'Queue URL',
    endpointPlaceholder: 'https://www.linkedin.com/...',
    recommendedMode: 'manual_handoff',
    capabilities: ['draft connection', 'draft follow-up', 'manual send']
  },
  {
    id: 'reddit',
    title: 'Reddit',
    description: 'Draft posts and replies for launch loops and niche communities, then publish manually.',
    accountRefLabel: 'Account',
    accountRefPlaceholder: 'u/founder-handle',
    endpointLabel: 'Subreddit / thread URL',
    endpointPlaceholder: 'https://www.reddit.com/r/...',
    recommendedMode: 'manual_handoff',
    capabilities: ['draft post', 'draft reply', 'manual publish']
  },
  {
    id: 'product_hunt',
    title: 'Product Hunt',
    description: 'Track launch prep and copy without auto-posting.',
    accountRefLabel: 'Launch profile',
    accountRefPlaceholder: 'Product Hunt maker profile',
    endpointLabel: 'Launch URL',
    endpointPlaceholder: 'https://www.producthunt.com/...',
    recommendedMode: 'manual_handoff',
    capabilities: ['launch checklist', 'draft launch copy', 'manual publish']
  }
];

const STAGE_ORDER: SalesLeadStage[] = ['candidate', 'reviewed', 'enriched', 'ready_for_draft', 'drafted', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'];

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
  if (!value) return undefined;
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

export function createDefaultProviderAccounts(): SalesProviderAccount[] {
  return SALES_PROVIDER_DEFINITIONS.map((definition) => ({
    id: definition.id,
    provider: definition.id,
    label: definition.title,
    status: 'not_connected',
    mode: definition.recommendedMode,
    health: 'unknown',
    accountRef: '',
    endpointUrl: '',
    notes: '',
    capabilities: [...definition.capabilities],
    scopes: [],
    lastValidationMessage: 'Not checked yet.',
    logs: []
  }));
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
    if (!lead.id) continue;
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
    if (!status) continue;
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

export function createDefaultSalesCockpitState(): SalesCockpitState {
  const product = createSalesCockpitProduct('Leion Delivery');
  return {
    version: 4,
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
  const status = String(raw?.status || '').trim() === 'target'
    ? 'reviewed'
    : (SALES_LEAD_STAGES.includes(raw?.status) ? raw.status : 'reviewed');
  const lead: SalesCockpitLead = {
    id: String(raw?.id || slugify(company)).trim(),
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
  return {
    id: String(raw?.id || slugify(title)).trim(),
    title,
    status: raw?.status === 'done' ? 'done' : 'todo',
    kind: SALES_TASK_KINDS.includes(raw?.kind) ? raw.kind : 'outreach',
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
    id: String(raw?.id || slugify(name)).trim(),
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
    id: String(raw?.id || slugify(name)).trim(),
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
      level: ['info', 'success', 'warning', 'error'].includes(entry?.level) ? entry.level : 'info',
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
    lastValidatedAt: raw?.lastValidatedAt ? String(raw.lastValidatedAt).trim() : fallback.lastValidatedAt,
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
  if (!subject && !to) return null;
  return {
    id: String(raw?.id || slugify(`${to}-${subject}`)).trim(),
    provider: 'gmail',
    status: SALES_DRAFT_STATUSES.includes(raw?.status) ? raw.status : 'drafted',
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
  const incomingProviders = Array.isArray(raw?.providerAccounts) ? raw.providerAccounts : [];
  const providerAccounts = defaults.providerAccounts.map((fallback) => {
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
  const mcpServers = Array.isArray(raw?.mcpServers)
    ? raw.mcpServers.map(sanitizeMcpServer).filter(Boolean) as SalesCockpitMcpServer[]
    : defaults.mcpServers;

  const activeProduct = incomingProducts.find((product) => product.id === activeProductId) || incomingProducts[0] || createSalesCockpitProduct();
  const base = {
    version: 4 as const,
    lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
    activeProductId,
    products: incomingProducts,
    mcpServers: mcpServers.length > 0 ? mcpServers : defaults.mcpServers,
    providerAccounts,
    ...snapshotFromProduct(activeProduct)
  } as SalesCockpitState;

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

function reachedStage(status: SalesLeadStage, threshold: SalesLeadStage): boolean {
  const statusIndex = STAGE_ORDER.indexOf(status);
  const thresholdIndex = STAGE_ORDER.indexOf(threshold);
  if (statusIndex === -1 || thresholdIndex === -1) return false;
  if (status === 'lost') return false;
  return statusIndex >= thresholdIndex;
}

function compareDate(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function includesAny(value: string, patterns: string[]): boolean {
  const normalized = String(value || '').toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function classifyFriction(task: SalesCockpitTask): 'product' | 'offer' | 'sales' | 'cockpit' | 'pipeline' | 'general' {
  const haystack = `${task.title} ${task.detail || ''}`.toLowerCase();
  if (includesAny(haystack, ['pipeline', 'intent', 'run', 'builder', 'workflow'])) return 'pipeline';
  if (includesAny(haystack, ['offer', 'pricing', 'promise', 'landing', 'proof'])) return 'offer';
  if (includesAny(haystack, ['lead', 'prospect', 'email', 'outbound', 'demo', 'follow-up', 'follow up'])) return 'sales';
  if (includesAny(haystack, ['cockpit', 'ui', 'ux', 'dashboard', 'provider'])) return 'cockpit';
  if (includesAny(haystack, ['product', 'idea', 'positioning', 'saas'])) return 'product';
  return 'general';
}

function buildLeadGenerationBrief(cockpit: SalesCockpitState): SalesCockpitLeadGenerationBrief {
  const audience = cockpit.offer.audience || 'equipes software avec friction repetitive';
  const problem = cockpit.offer.problem || 'travail delivery repetitif';
  const promise = cockpit.offer.promise || 'workflow gouverne avec validation humaine';
  const icpSummary = `${audience} qui vivent ${problem.toLowerCase()}`;
  const searchQueries = [
    `${audience} GitHub livraison`,
    `${audience} CTO agence software factory`,
    `${audience} PR review release process`,
    `${audience} engineering manager github workflow`
  ].filter((entry, index, all) => entry.trim() && all.indexOf(entry) === index).slice(0, 4);
  const outreachAngles = [
    `Promesse: ${promise}`,
    `Probleme central: ${problem}`,
    'Angle: remplacer le travail delivery repetitif par une boucle gouvernee, pas par une autonomie opaque.',
    'Angle: montrer Issue -> PR, PR Fix et Release Gate comme surfaces vendables.'
  ];
  const qualificationChecklist = [
    'Le prospect a un flux GitHub repetitif avec revues ou releases frequentes.',
    'Une validation humaine reste obligatoire avant merge ou push.',
    'Le prospect peut montrer un repo ou un exemple concret a piloter.',
    'Le gain attendu est du temps operatoire, pas juste de la curiosite IA.'
  ];
  return {
    icpSummary,
    searchQueries,
    outreachAngles,
    qualificationChecklist
  };
}

function buildReadiness(cockpit: SalesCockpitState): SalesCockpitReadiness {
  let score = 0;
  const blockers: string[] = [];
  const strengths: string[] = [];

  if (cockpit.offer.name && cockpit.offer.problem && cockpit.offer.promise && cockpit.offer.callToAction) {
    score += 20;
    strengths.push('Offre structuree');
  } else {
    blockers.push('L offre n est pas encore complete.');
  }

  if (cockpit.pipelinePaths.length >= 1 && cockpit.pipelinePaths.length <= 3) {
    score += 20;
    strengths.push('Pipelines relies');
  } else if (cockpit.pipelinePaths.length > 3) {
    score += 10;
    blockers.push('Le produit depasse la regle des 1 a 3 pipelines.');
  } else {
    blockers.push('Aucun pipeline relie au produit.');
  }

  if (cockpit.providerAccounts.some((provider) => provider.provider === 'email' && provider.status === 'connected')) {
    score += 15;
    strengths.push('Canal Gmail pret');
  } else {
    blockers.push('Gmail n est pas connecte.');
  }

  if (cockpit.providerAccounts.some((provider) => provider.provider === 'google_sheets' && provider.status === 'connected')) {
    score += 15;
    strengths.push('Google Workspace pret');
  } else {
    blockers.push('Google Workspace n est pas connecte.');
  }

  if (cockpit.defaultSheetUrl) {
    score += 10;
    strengths.push('Sheet produit reliee');
  } else {
    blockers.push('Aucune Google Sheet reliee.');
  }

  if (cockpit.proofAssets.length > 0) {
    score += 10;
    strengths.push('Preuve commerciale disponible');
  } else {
    blockers.push('Aucune preuve capturee.');
  }

  if (cockpit.leads.length >= 5) {
    score += 10;
    strengths.push('Premiere base de leads presente');
  } else {
    blockers.push('Moins de 5 leads qualifies.');
  }

  const label = score >= 85 ? 'Pret a operer'
    : score >= 65 ? 'Presque pret'
    : score >= 40 ? 'En construction'
    : 'Encore fragile';
  const nextMilestone = blockers[0] || 'Passer en outbound proprement.';
  return { score, label, blockers, strengths, nextMilestone };
}

function buildLeadSignals(cockpit: SalesCockpitState): SalesCockpitLeadSignals {
  const today = new Date().toISOString().slice(0, 10);
  const openLeads = cockpit.leads.filter((lead) => lead.status !== 'won' && lead.status !== 'lost');
  return {
    totalOpen: openLeads.length,
    readyForDraft: openLeads.filter((lead) => lead.status === 'ready_for_draft' || (!!lead.email && !!lead.pain && !!lead.nextAction)).length,
    missingEmail: openLeads.filter((lead) => !lead.email).length,
    stale: openLeads.filter((lead) => !!lead.dueDate && lead.dueDate < today).length,
    missingPain: openLeads.filter((lead) => !lead.pain).length,
    missingNextAction: openLeads.filter((lead) => !lead.nextAction).length
  };
}

function buildFrictionSummary(cockpit: SalesCockpitState): SalesCockpitFrictionSummary {
  const frictions = cockpit.tasks.filter((task) => task.kind === 'friction' && task.status === 'todo');
  const byType = {
    product: 0,
    offer: 0,
    sales: 0,
    cockpit: 0,
    pipeline: 0,
    general: 0
  };
  for (const friction of frictions) {
    byType[classifyFriction(friction)] += 1;
  }
  return {
    total: frictions.length,
    byType
  };
}

function buildRecommendations(cockpit: SalesCockpitState, readiness: SalesCockpitReadiness, leadSignals: SalesCockpitLeadSignals, frictionSummary: SalesCockpitFrictionSummary): SalesCockpitRecommendation[] {
  const recommendations: SalesCockpitRecommendation[] = [];

  if (cockpit.pipelinePaths.length === 0) {
    recommendations.push({
      id: 'rec-pipeline',
      title: 'Relier le premier pipeline',
      reason: 'Sans pipeline, le produit n a pas encore de moteur operable.',
      priority: 'high',
      module: 'products',
      cta: 'Attacher 1 pipeline'
    });
  }

  if (!cockpit.providerAccounts.some((provider) => provider.provider === 'email' && provider.status === 'connected')) {
    recommendations.push({
      id: 'rec-gmail',
      title: 'Connecter Gmail',
      reason: 'Tu ne peux pas produire une vraie file de drafts sans canal email pret.',
      priority: 'high',
      module: 'providers',
      cta: 'Connecter Gmail'
    });
  }

  if (!cockpit.defaultSheetUrl) {
    recommendations.push({
      id: 'rec-sheet',
      title: 'Relier une Google Sheet produit',
      reason: 'La sync offre/leads/proof/actions devient beaucoup plus utile une fois la sheet fixee.',
      priority: 'high',
      module: 'products',
      cta: 'Relier une sheet'
    });
  }

  if (leadSignals.readyForDraft > 0) {
    recommendations.push({
      id: 'rec-drafts',
      title: `Generer ${leadSignals.readyForDraft} draft(s) Gmail`,
      reason: 'Tu as deja des leads exploitables avec email, douleur et prochaine action.',
      priority: 'high',
      module: 'contact',
      cta: 'Remplir la draft queue'
    });
  }

  if (leadSignals.missingEmail > 0) {
    recommendations.push({
      id: 'rec-emails',
      title: 'Completer les emails manquants',
      reason: `${leadSignals.missingEmail} lead(s) restent bloques sans email.`,
      priority: 'medium',
      module: 'prospects',
      cta: 'Completer les leads'
    });
  }

  if (cockpit.proofAssets.length === 0) {
    recommendations.push({
      id: 'rec-proof',
      title: 'Capturer une premiere preuve',
      reason: 'Sans preuve, le cockpit vend une promesse mais pas encore un resultat montre.',
      priority: 'high',
      module: 'proof',
      cta: 'Ouvrir le proof locker'
    });
  }

  if (frictionSummary.total > 0) {
    recommendations.push({
      id: 'rec-friction',
      title: 'Vider la friction inbox',
      reason: `${frictionSummary.total} friction(s) freinent encore la boucle commerciale.`,
      priority: 'medium',
      module: 'proof',
      cta: 'Traiter les frictions'
    });
  }

  if (cockpit.mcpServers.some((server) => (server.status === 'configured' || server.status === 'connected') && (!server.tools || server.tools.length === 0))) {
    recommendations.push({
      id: 'rec-mcp',
      title: 'Decouvrir les tools MCP',
      reason: 'Le registre MCP est configure mais les outils utilisables ne sont pas encore visibles.',
      priority: 'medium',
      module: 'proof',
      cta: 'Scanner les serveurs'
    });
  }

  if (readiness.score >= 70 && leadSignals.totalOpen < 5) {
    recommendations.push({
      id: 'rec-leadgen',
      title: 'Lancer une vraie session de generation de leads',
      reason: 'Le produit devient operable, il faut maintenant remplir le haut de funnel.',
      priority: 'medium',
      module: 'prospects',
      cta: 'Ouvrir le generateur'
    });
  }

  return recommendations.slice(0, 6);
}

export function buildSalesCockpitModel(cockpit: SalesCockpitState): SalesCockpitModel {
  const stageCounts = SALES_LEAD_STAGES.reduce((acc, stage) => {
    acc[stage] = cockpit.leads.filter((lead) => lead.status === stage).length;
    return acc;
  }, {} as Record<SalesLeadStage, number>);

  const today = new Date().toISOString().slice(0, 10);
  const openTasks = [...cockpit.tasks]
    .filter((task) => task.status === 'todo')
    .sort((left, right) => compareDate(left.dueDate, right.dueDate) || left.title.localeCompare(right.title));
  const readiness = buildReadiness(cockpit);
  const leadSignals = buildLeadSignals(cockpit);
  const frictionSummary = buildFrictionSummary(cockpit);
  const leadGenerationBrief = buildLeadGenerationBrief(cockpit);
  const recommendations = buildRecommendations(cockpit, readiness, leadSignals, frictionSummary);

  const actionCenter: SalesCockpitActionItem[] = [];
  if (!cockpit.pipelinePaths.length) {
    actionCenter.push({
      id: 'action-pipelines',
      title: 'Relier 1 a 3 pipelines',
      detail: 'Ce produit n a encore aucun pipeline relie.',
      kind: 'product'
    });
  }
  if (!cockpit.defaultSheetUrl) {
    actionCenter.push({
      id: 'action-sheet',
      title: 'Relier une Google Sheet',
      detail: 'La sync cockpit devient vraiment utile une fois la sheet produit fixee.',
      kind: 'provider'
    });
  }
  if (!cockpit.proofAssets.length) {
    actionCenter.push({
      id: 'action-proof',
      title: 'Capturer une premiere preuve',
      detail: 'Ajoute au moins un run, screenshot ou resultat measurable au Proof Locker.',
      kind: 'proof'
    });
  }
  if (frictionSummary.total > 0) {
    actionCenter.push({
      id: 'action-frictions',
      title: `Traiter ${frictionSummary.total} friction(s)`,
      detail: 'Des frictions ouvertes ralentissent encore la boucle commerciale.',
      kind: 'delivery'
    });
  }
  if (cockpit.draftQueue.length > 0) {
    actionCenter.push({
      id: 'action-drafts',
      title: `Relire ${cockpit.draftQueue.length} draft(s) Gmail`,
      detail: cockpit.draftQueue[0]?.subject || 'La draft queue doit etre revue.',
      kind: 'lead'
    });
  }
  if (leadSignals.readyForDraft > 0) {
    actionCenter.push({
      id: 'action-ready-drafts',
      title: `Generer ${leadSignals.readyForDraft} draft(s)`,
      detail: 'Des leads sont deja assez complets pour partir en outreach.',
      kind: 'lead'
    });
  }
  if (openTasks[0]) {
    actionCenter.push({
      id: `action-task-${openTasks[0].id}`,
      title: openTasks[0].title,
      detail: openTasks[0].dueDate ? `Echeance ${openTasks[0].dueDate}` : 'Pas d echeance definie',
      kind: 'delivery'
    });
  }

  return {
    activeProduct: {
      id: cockpit.activeProductId,
      name: cockpit.offer.name,
      slug: slugify(cockpit.offer.name),
      stage: cockpit.productStage,
      notes: cockpit.notes,
      offer: cockpit.offer,
      funnel: cockpit.funnel,
      weeklyTargets: cockpit.weeklyTargets,
      leads: cockpit.leads,
      tasks: cockpit.tasks,
      campaigns: cockpit.campaigns,
      templates: cockpit.templates,
      draftQueue: cockpit.draftQueue,
      proofAssets: cockpit.proofAssets,
      pipelinePaths: cockpit.pipelinePaths,
      ideaPath: cockpit.ideaPath,
      implementPath: cockpit.implementPath,
      defaultSheetUrl: cockpit.defaultSheetUrl,
      leadInbox: cockpit.leadInbox,
      campaignQueue: cockpit.campaignQueue,
      sheetBinding: cockpit.sheetBinding,
      providerBindings: cockpit.providerBindings,
      activityLog: cockpit.activityLog,
      mcpToolBindings: cockpit.mcpToolBindings
    },
    metrics: [
      {
        key: 'outbound',
        label: 'Outbound',
        current: cockpit.leads.filter((lead) => reachedStage(lead.status, 'contacted')).length,
        target: cockpit.weeklyTargets.outbound
      },
      {
        key: 'discovery',
        label: 'Discovery',
        current: cockpit.leads.filter((lead) => reachedStage(lead.status, 'discovery')).length,
        target: cockpit.weeklyTargets.discovery
      },
      {
        key: 'demos',
        label: 'Demos',
        current: cockpit.leads.filter((lead) => reachedStage(lead.status, 'demo')).length,
        target: cockpit.weeklyTargets.demos
      },
      {
        key: 'proposals',
        label: 'Proposals',
        current: cockpit.leads.filter((lead) => reachedStage(lead.status, 'proposal')).length,
        target: cockpit.weeklyTargets.proposals
      }
    ],
    stageCounts,
    openTasks,
    overdueTasks: openTasks.filter((task) => !!task.dueDate && task.dueDate < today).length,
    activeCampaigns: cockpit.campaigns.filter((campaign) => campaign.active),
    openLeads: [...cockpit.leads]
      .filter((lead) => lead.status !== 'won' && lead.status !== 'lost')
      .sort((left, right) => compareDate(left.dueDate, right.dueDate) || left.company.localeCompare(right.company)),
    leadInbox: cockpit.leadInbox,
    campaignQueue: cockpit.campaignQueue,
    activityLog: cockpit.activityLog,
    providerSummary: {
      total: cockpit.providerAccounts.length,
      connected: cockpit.providerAccounts.filter((provider) => provider.status === 'connected').length,
      configured: cockpit.providerAccounts.filter((provider) => provider.status === 'configured').length,
      draftOnly: cockpit.providerAccounts.filter((provider) => provider.mode === 'draft_only').length,
      unhealthy: cockpit.providerAccounts.filter((provider) => provider.health === 'warning' || provider.health === 'error').length
    },
    productSummary: {
      total: cockpit.products.length,
      activeName: cockpit.offer.name,
      activeStage: cockpit.productStage
    },
    proofSummary: {
      total: cockpit.proofAssets.length,
      ready: cockpit.proofAssets.filter((asset) => asset.status === 'ready').length
    },
    mcpSummary: {
      total: cockpit.mcpServers.length,
      ready: cockpit.mcpServers.filter((server) => server.status === 'connected' || server.status === 'configured').length,
      discoveredTools: cockpit.mcpServers.reduce((sum, server) => sum + (server.tools?.length || 0), 0)
    },
    readiness,
    recommendations,
    leadSignals,
    frictionSummary,
    leadGenerationBrief,
    actionCenter
  };
}

export function renderSalesTemplate(template: SalesCockpitTemplate, lead?: SalesCockpitLead): { subject?: string; body: string } {
  const name = String(lead?.contactName || lead?.company || 'there').trim();
  const company = String(lead?.company || '').trim();
  const replacements: Record<string, string> = {
    name,
    company,
    role: String(lead?.role || '').trim(),
    pain: String(lead?.pain || '').trim(),
    nextAction: String(lead?.nextAction || '').trim()
  };
  const apply = (value?: string): string | undefined => value?.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] || '');
  return {
    subject: apply(template.subject),
    body: apply(template.body) || template.body
  };
}

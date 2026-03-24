export const SALES_LEAD_STAGES = ['target', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'] as const;
export const SALES_TASK_KINDS = ['outreach', 'follow_up', 'demo', 'proposal', 'proof'] as const;
export const SALES_CHANNELS = ['email', 'linkedin'] as const;
export const SALES_PROVIDER_IDS = ['email', 'google_sheets', 'crm', 'linkedin', 'reddit', 'product_hunt'] as const;
export const SALES_PROVIDER_STATUSES = ['not_connected', 'configured', 'connected'] as const;
export const SALES_PROVIDER_MODES = ['draft_only', 'manual_handoff', 'sync_only'] as const;
export const SALES_PRODUCT_STAGES = ['idea', 'offer', 'outbound', 'pilot', 'won'] as const;
export const PROOF_ASSET_KINDS = ['run', 'doc', 'metric', 'snippet', 'screenshot'] as const;
export const PROOF_ASSET_STATUSES = ['draft', 'ready'] as const;
export const MCP_TRANSPORTS = ['http', 'sse', 'stdio'] as const;
export const MCP_SERVER_STATUSES = ['not_configured', 'configured', 'connected'] as const;

export type SalesLeadStage = typeof SALES_LEAD_STAGES[number];
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = typeof SALES_TASK_KINDS[number];
export type SalesChannel = typeof SALES_CHANNELS[number];
export type SalesProviderId = typeof SALES_PROVIDER_IDS[number];
export type SalesProviderStatus = typeof SALES_PROVIDER_STATUSES[number];
export type SalesProviderMode = typeof SALES_PROVIDER_MODES[number];
export type SalesProductStage = typeof SALES_PRODUCT_STAGES[number];
export type ProofAssetKind = typeof PROOF_ASSET_KINDS[number];
export type ProofAssetStatus = typeof PROOF_ASSET_STATUSES[number];
export type McpTransport = typeof MCP_TRANSPORTS[number];
export type McpServerStatus = typeof MCP_SERVER_STATUSES[number];

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
};

export type SalesCockpitTask = {
  id: string;
  title: string;
  status: SalesTaskStatus;
  kind: SalesTaskKind;
  owner: string;
  dueDate?: string;
  leadId?: string;
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
  accountRef?: string;
  endpointUrl?: string;
  notes?: string;
  capabilities: string[];
  lastValidatedAt?: string;
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
  proofAssets: SalesCockpitProofAsset[];
  pipelinePaths: string[];
  ideaPath?: string;
  implementPath?: string;
  defaultSheetUrl?: string;
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
  notes?: string;
  assignedProductIds: string[];
};

export type SalesCockpitState = {
  version: 2;
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
  providerAccounts: SalesProviderAccount[];
  proofAssets: SalesCockpitProofAsset[];
  pipelinePaths: string[];
  ideaPath?: string;
  implementPath?: string;
  defaultSheetUrl?: string;
  productStage: SalesProductStage;
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

export type SalesCockpitModel = {
  activeProduct: SalesCockpitProduct;
  metrics: SalesCockpitMetric[];
  stageCounts: Record<SalesLeadStage, number>;
  openTasks: SalesCockpitTask[];
  overdueTasks: number;
  activeCampaigns: SalesCockpitCampaign[];
  openLeads: SalesCockpitLead[];
  providerSummary: {
    total: number;
    connected: number;
    configured: number;
    draftOnly: number;
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
  };
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

const STAGE_ORDER: SalesLeadStage[] = ['target', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'];

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
    accountRef: '',
    endpointUrl: '',
    notes: '',
    capabilities: [...definition.capabilities]
  }));
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
      notes: 'Reference MCP surface already visible in local logs.',
      assignedProductIds: []
    }
  ];
}

export function createSalesCockpitProduct(name = 'Leion Delivery'): SalesCockpitProduct {
  const slug = slugify(name);
  return {
    id: `product-${slug}`,
    name,
    slug,
    stage: 'idea',
    notes: 'Use this product space to track one SaaS offer, one interface, and up to three pipelines.',
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
    proofAssets: [],
    pipelinePaths: [],
    ideaPath: 'idea.md',
    implementPath: 'implement.md',
    defaultSheetUrl: ''
  };
}

function snapshotFromProduct(product: SalesCockpitProduct): Pick<SalesCockpitState, 'notes' | 'offer' | 'funnel' | 'weeklyTargets' | 'leads' | 'tasks' | 'campaigns' | 'templates' | 'proofAssets' | 'pipelinePaths' | 'ideaPath' | 'implementPath' | 'defaultSheetUrl' | 'productStage'> {
  return {
    notes: product.notes,
    offer: product.offer,
    funnel: product.funnel,
    weeklyTargets: product.weeklyTargets,
    leads: product.leads,
    tasks: product.tasks,
    campaigns: product.campaigns,
    templates: product.templates,
    proofAssets: product.proofAssets,
    pipelinePaths: product.pipelinePaths,
    ideaPath: product.ideaPath,
    implementPath: product.implementPath,
    defaultSheetUrl: product.defaultSheetUrl,
    productStage: product.stage
  };
}

function applySnapshotToProduct(product: SalesCockpitProduct, state: Partial<SalesCockpitState>): SalesCockpitProduct {
  return {
    ...product,
    notes: state.notes ?? product.notes,
    offer: state.offer ?? product.offer,
    funnel: state.funnel ?? product.funnel,
    weeklyTargets: state.weeklyTargets ?? product.weeklyTargets,
    leads: state.leads ?? product.leads,
    tasks: state.tasks ?? product.tasks,
    campaigns: state.campaigns ?? product.campaigns,
    templates: state.templates ?? product.templates,
    proofAssets: state.proofAssets ?? product.proofAssets,
    pipelinePaths: state.pipelinePaths ?? product.pipelinePaths,
    ideaPath: state.ideaPath ?? product.ideaPath,
    implementPath: state.implementPath ?? product.implementPath,
    defaultSheetUrl: state.defaultSheetUrl ?? product.defaultSheetUrl,
    stage: state.productStage ?? product.stage
  };
}

function hydrateActiveProduct(state: SalesCockpitState): SalesCockpitState {
  const activeProduct = state.products.find((product) => product.id === state.activeProductId) || state.products[0];
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
      : product
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
    version: 2,
    lastUpdatedAt: timestamp(),
    activeProductId: product.id,
    products: [product],
    mcpServers: createDefaultMcpServers(),
    providerAccounts: createDefaultProviderAccounts(),
    ...snapshotFromProduct(product)
  };
}

function sanitizeLead(raw: any): SalesCockpitLead | null {
  const company = String(raw?.company || '').trim();
  if (!company) return null;
  const status = SALES_LEAD_STAGES.includes(raw?.status) ? raw.status : 'target';
  return {
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
    leadId: raw?.leadId ? String(raw.leadId).trim() : undefined
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

  return {
    id: String(raw?.id || fallback.id).trim() || fallback.id,
    provider,
    label: String(raw?.label || fallback.label).trim() || fallback.label,
    status,
    mode,
    accountRef: raw?.accountRef ? String(raw.accountRef).trim() : fallback.accountRef,
    endpointUrl: raw?.endpointUrl ? String(raw.endpointUrl).trim() : fallback.endpointUrl,
    notes: raw?.notes ? String(raw.notes) : fallback.notes,
    capabilities,
    lastValidatedAt: raw?.lastValidatedAt ? String(raw.lastValidatedAt).trim() : fallback.lastValidatedAt
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

function sanitizeProduct(raw: any, fallbackName: string, fallbackId?: string): SalesCockpitProduct {
  const fallback = createSalesCockpitProduct(fallbackName);
  const leads = Array.isArray(raw?.leads) ? raw.leads.map(sanitizeLead).filter(Boolean) as SalesCockpitLead[] : fallback.leads;
  const tasks = Array.isArray(raw?.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) as SalesCockpitTask[] : fallback.tasks;
  const campaigns = Array.isArray(raw?.campaigns) ? raw.campaigns.map(sanitizeCampaign).filter(Boolean) as SalesCockpitCampaign[] : fallback.campaigns;
  const templates = Array.isArray(raw?.templates) ? raw.templates.map(sanitizeTemplate).filter(Boolean) as SalesCockpitTemplate[] : fallback.templates;
  const proofAssets = Array.isArray(raw?.proofAssets) ? raw.proofAssets.map(sanitizeProofAsset).filter(Boolean) as SalesCockpitProofAsset[] : fallback.proofAssets;
  const name = String(raw?.name || fallbackName || fallback.name).trim() || fallback.name;
  const slug = String(raw?.slug || slugify(name)).trim() || slugify(name);
  const id = String(raw?.id || fallbackId || `product-${slug}`).trim() || `product-${slug}`;
  const pipelinePaths = Array.isArray(raw?.pipelinePaths)
    ? raw.pipelinePaths.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
    : fallback.pipelinePaths;

  return {
    id,
    name,
    slug,
    stage: SALES_PRODUCT_STAGES.includes(raw?.stage) ? raw.stage : fallback.stage,
    notes: String(raw?.notes || fallback.notes),
    offer: sanitizeOffer(raw?.offer, {
      ...fallback.offer,
      name
    }),
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
    proofAssets,
    pipelinePaths,
    ideaPath: raw?.ideaPath ? String(raw.ideaPath).trim() : fallback.ideaPath,
    implementPath: raw?.implementPath ? String(raw.implementPath).trim() : fallback.implementPath,
    defaultSheetUrl: raw?.defaultSheetUrl ? String(raw.defaultSheetUrl).trim() : fallback.defaultSheetUrl
  };
}

function sanitizeMcpServer(raw: any): SalesCockpitMcpServer | null {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  return {
    id: String(raw?.id || slugify(name)).trim(),
    name,
    transport: MCP_TRANSPORTS.includes(raw?.transport) ? raw.transport : 'http',
    endpointUrl: raw?.endpointUrl ? String(raw.endpointUrl).trim() : undefined,
    command: raw?.command ? String(raw.command).trim() : undefined,
    args: Array.isArray(raw?.args) ? raw.args.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
    status: MCP_SERVER_STATUSES.includes(raw?.status) ? raw.status : 'not_configured',
    toolSummary: Array.isArray(raw?.toolSummary) ? raw.toolSummary.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
    notes: raw?.notes ? String(raw.notes) : undefined,
    assignedProductIds: Array.isArray(raw?.assignedProductIds) ? raw.assignedProductIds.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : []
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
      proofAssets: raw?.proofAssets,
      pipelinePaths: raw?.pipelinePaths,
      ideaPath: raw?.ideaPath,
      implementPath: raw?.implementPath,
      defaultSheetUrl: raw?.defaultSheetUrl
    }, raw?.offer?.name || 'Leion Delivery')];

  const activeProductId = String(raw?.activeProductId || incomingProducts[0]?.id || defaults.activeProductId).trim();
  const mcpServers = Array.isArray(raw?.mcpServers)
    ? raw.mcpServers.map(sanitizeMcpServer).filter(Boolean) as SalesCockpitMcpServer[]
    : defaults.mcpServers;

  const base = {
    version: 2 as const,
    lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
    activeProductId,
    products: incomingProducts,
    mcpServers: mcpServers.length > 0 ? mcpServers : defaults.mcpServers,
    providerAccounts
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

export function buildSalesCockpitModel(cockpit: SalesCockpitState): SalesCockpitModel {
  const stageCounts = SALES_LEAD_STAGES.reduce((acc, stage) => {
    acc[stage] = cockpit.leads.filter((lead) => lead.status === stage).length;
    return acc;
  }, {} as Record<SalesLeadStage, number>);

  const today = new Date().toISOString().slice(0, 10);
  const openTasks = [...cockpit.tasks]
    .filter((task) => task.status === 'todo')
    .sort((left, right) => compareDate(left.dueDate, right.dueDate) || left.title.localeCompare(right.title));

  const actionCenter: SalesCockpitActionItem[] = [];
  if (!cockpit.pipelinePaths.length) {
    actionCenter.push({
      id: 'action-pipelines',
      title: 'Link up to 3 pipelines',
      detail: 'This product still has no attached delivery or growth pipeline.',
      kind: 'product'
    });
  }
  if (!cockpit.defaultSheetUrl) {
    actionCenter.push({
      id: 'action-sheet',
      title: 'Attach a Google Sheet',
      detail: 'Set a default Sheet URL before sync becomes useful.',
      kind: 'provider'
    });
  }
  if (!cockpit.proofAssets.length) {
    actionCenter.push({
      id: 'action-proof',
      title: 'Capture first proof asset',
      detail: 'Save one run, screenshot, or measurable result in the Proof Locker.',
      kind: 'proof'
    });
  }
  if (cockpit.providerAccounts.filter((provider) => provider.status === 'connected' || provider.status === 'configured').length < 2) {
    actionCenter.push({
      id: 'action-providers',
      title: 'Connect the core providers',
      detail: 'Google Workspace and Email / Gmail should both be ready for this cockpit.',
      kind: 'provider'
    });
  }
  const nextLead = cockpit.leads.find((lead) => lead.status !== 'won' && lead.status !== 'lost' && !!lead.nextAction);
  if (nextLead) {
    actionCenter.push({
      id: `action-lead-${nextLead.id}`,
      title: `Move ${nextLead.company}`,
      detail: nextLead.nextAction,
      kind: 'lead'
    });
  }
  if (openTasks[0]) {
    actionCenter.push({
      id: `action-task-${openTasks[0].id}`,
      title: openTasks[0].title,
      detail: openTasks[0].dueDate ? `Due ${openTasks[0].dueDate}` : 'No due date set',
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
      proofAssets: cockpit.proofAssets,
      pipelinePaths: cockpit.pipelinePaths,
      ideaPath: cockpit.ideaPath,
      implementPath: cockpit.implementPath,
      defaultSheetUrl: cockpit.defaultSheetUrl
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
    providerSummary: {
      total: cockpit.providerAccounts.length,
      connected: cockpit.providerAccounts.filter((provider) => provider.status === 'connected').length,
      configured: cockpit.providerAccounts.filter((provider) => provider.status === 'configured').length,
      draftOnly: cockpit.providerAccounts.filter((provider) => provider.mode === 'draft_only').length
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
      ready: cockpit.mcpServers.filter((server) => server.status === 'connected' || server.status === 'configured').length
    },
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

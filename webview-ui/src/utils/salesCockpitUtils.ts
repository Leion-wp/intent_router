export const SALES_LEAD_STAGES = ['target', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'] as const;
export const SALES_TASK_KINDS = ['outreach', 'follow_up', 'demo', 'proposal', 'proof'] as const;
export const SALES_CHANNELS = ['email', 'linkedin'] as const;
export const SALES_PROVIDER_IDS = ['email', 'google_sheets', 'crm', 'linkedin', 'reddit', 'product_hunt'] as const;
export const SALES_PROVIDER_STATUSES = ['not_connected', 'configured', 'connected'] as const;
export const SALES_PROVIDER_MODES = ['draft_only', 'manual_handoff', 'sync_only'] as const;

export type SalesLeadStage = typeof SALES_LEAD_STAGES[number];
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = typeof SALES_TASK_KINDS[number];
export type SalesChannel = typeof SALES_CHANNELS[number];
export type SalesProviderId = typeof SALES_PROVIDER_IDS[number];
export type SalesProviderStatus = typeof SALES_PROVIDER_STATUSES[number];
export type SalesProviderMode = typeof SALES_PROVIDER_MODES[number];

export type SalesCockpitLead = {
  id: string;
  company: string;
  contactName: string;
  role: string;
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

export type SalesCockpitState = {
  version: 1;
  lastUpdatedAt: string;
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
};

export type SalesCockpitMetric = {
  key: 'outbound' | 'discovery' | 'demos' | 'proposals';
  label: string;
  current: number;
  target: number;
};

export type SalesCockpitModel = {
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
};

export const SALES_PROVIDER_DEFINITIONS: SalesProviderDefinition[] = [
  {
    id: 'email',
    title: 'Email',
    description: 'Founder inbox and outbound drafts. Start with manual approval, not auto-send.',
    accountRefLabel: 'Address',
    accountRefPlaceholder: 'founder@company.com',
    endpointLabel: 'Workspace',
    endpointPlaceholder: 'Inbox alias or provider workspace',
    recommendedMode: 'draft_only',
    capabilities: ['draft message', 'manual send', 'reply tracking']
  },
  {
    id: 'google_sheets',
    title: 'Google Sheets',
    description: 'Target account lists, manual sync sheets, and lightweight prospect ops.',
    accountRefLabel: 'Sheet name',
    accountRefPlaceholder: 'Agency target list',
    endpointLabel: 'Sheet URL',
    endpointPlaceholder: 'https://docs.google.com/...',
    recommendedMode: 'sync_only',
    capabilities: ['target list', 'manual sync', 'export rows']
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

export function createDefaultSalesCockpitState(): SalesCockpitState {
  return {
    version: 1,
    lastUpdatedAt: timestamp(),
    notes: 'Use this cockpit to track agency outreach, next actions, and reusable messaging from inside VS Code.',
    offer: createDefaultOffer(),
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
        id: 'task-build-list',
        title: 'Build first 100 agency target list',
        status: 'todo',
        kind: 'outreach',
        owner: 'founder'
      },
      {
        id: 'task-book-calls',
        title: 'Book 10 discovery calls in 30 days',
        status: 'todo',
        kind: 'follow_up',
        owner: 'founder'
      },
      {
        id: 'task-close-pilots',
        title: 'Convert 2 pilot proposals',
        status: 'todo',
        kind: 'proposal',
        owner: 'founder'
      }
    ],
    campaigns: [
      {
        id: 'campaign-founder-email',
        name: 'Founder outbound email',
        channel: 'email',
        goal: 'Get first discovery calls with agencies',
        templateId: 'tpl-founder-email',
        active: true
      },
      {
        id: 'campaign-linkedin-followup',
        name: 'LinkedIn follow-up',
        channel: 'linkedin',
        goal: 'Revive conversations after first touch',
        templateId: 'tpl-linkedin-followup',
        active: true
      }
    ],
    templates: [
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
    ],
    providerAccounts: createDefaultProviderAccounts()
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
  return {
    version: 1,
    lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
    notes: String(raw?.notes || defaults.notes),
    offer: sanitizeOffer(raw?.offer, defaults.offer),
    funnel: sanitizeFunnel(raw?.funnel, defaults.funnel),
    weeklyTargets: {
      outbound: Number(raw?.weeklyTargets?.outbound || defaults.weeklyTargets.outbound),
      discovery: Number(raw?.weeklyTargets?.discovery || defaults.weeklyTargets.discovery),
      demos: Number(raw?.weeklyTargets?.demos || defaults.weeklyTargets.demos),
      proposals: Number(raw?.weeklyTargets?.proposals || defaults.weeklyTargets.proposals)
    },
    leads: Array.isArray(raw?.leads) ? raw.leads.map(sanitizeLead).filter(Boolean) as SalesCockpitLead[] : defaults.leads,
    tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) as SalesCockpitTask[] : defaults.tasks,
    campaigns: Array.isArray(raw?.campaigns) ? raw.campaigns.map(sanitizeCampaign).filter(Boolean) as SalesCockpitCampaign[] : defaults.campaigns,
    templates: Array.isArray(raw?.templates) ? raw.templates.map(sanitizeTemplate).filter(Boolean) as SalesCockpitTemplate[] : defaults.templates,
    providerAccounts
  };
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

  return {
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
    }
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

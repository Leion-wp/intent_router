export const SALES_LEAD_STAGES = ['target', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'] as const;
export const SALES_TASK_KINDS = ['outreach', 'follow_up', 'demo', 'proposal', 'proof'] as const;
export const SALES_CHANNELS = ['email', 'linkedin'] as const;

export type SalesLeadStage = typeof SALES_LEAD_STAGES[number];
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = typeof SALES_TASK_KINDS[number];
export type SalesChannel = typeof SALES_CHANNELS[number];

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

export type SalesCockpitState = {
  version: 1;
  lastUpdatedAt: string;
  notes: string;
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
};

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

export function createDefaultSalesCockpitState(): SalesCockpitState {
  return {
    version: 1,
    lastUpdatedAt: timestamp(),
    notes: 'Use this cockpit to track agency outreach, next actions, and reusable messaging from inside VS Code.',
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
    ]
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

export function coerceSalesCockpitState(raw: any): SalesCockpitState {
  const defaults = createDefaultSalesCockpitState();
  return {
    version: 1,
    lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
    notes: String(raw?.notes || defaults.notes),
    weeklyTargets: {
      outbound: Number(raw?.weeklyTargets?.outbound || defaults.weeklyTargets.outbound),
      discovery: Number(raw?.weeklyTargets?.discovery || defaults.weeklyTargets.discovery),
      demos: Number(raw?.weeklyTargets?.demos || defaults.weeklyTargets.demos),
      proposals: Number(raw?.weeklyTargets?.proposals || defaults.weeklyTargets.proposals)
    },
    leads: Array.isArray(raw?.leads) ? raw.leads.map(sanitizeLead).filter(Boolean) as SalesCockpitLead[] : defaults.leads,
    tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) as SalesCockpitTask[] : defaults.tasks,
    campaigns: Array.isArray(raw?.campaigns) ? raw.campaigns.map(sanitizeCampaign).filter(Boolean) as SalesCockpitCampaign[] : defaults.campaigns,
    templates: Array.isArray(raw?.templates) ? raw.templates.map(sanitizeTemplate).filter(Boolean) as SalesCockpitTemplate[] : defaults.templates
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
      .sort((left, right) => compareDate(left.dueDate, right.dueDate) || left.company.localeCompare(right.company))
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

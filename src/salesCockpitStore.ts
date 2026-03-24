import * as vscode from 'vscode';

export type SalesLeadStage = 'target' | 'contacted' | 'discovery' | 'demo' | 'proposal' | 'pilot' | 'won' | 'lost';
export type SalesTaskStatus = 'todo' | 'done';
export type SalesTaskKind = 'outreach' | 'follow_up' | 'demo' | 'proposal' | 'proof';
export type SalesChannel = 'email' | 'linkedin';

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

const FILE_VERSION = 1 as const;

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

async function ensureParentFolder(uri: vscode.Uri): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) return;
    const parent = vscode.Uri.joinPath(root, '.intent-router');
    await vscode.workspace.fs.createDirectory(parent);
}

function timestamp(): string {
    return new Date().toISOString();
}

export function createDefaultSalesCockpitState(): SalesCockpitState {
    return {
        version: FILE_VERSION,
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
    const id = String(raw?.id || company.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
    const allowed: SalesLeadStage[] = ['target', 'contacted', 'discovery', 'demo', 'proposal', 'pilot', 'won', 'lost'];
    const status = allowed.includes(raw?.status) ? raw.status : 'target';
    return {
        id,
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
    const kinds: SalesTaskKind[] = ['outreach', 'follow_up', 'demo', 'proposal', 'proof'];
    return {
        id: String(raw?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim(),
        title,
        status: raw?.status === 'done' ? 'done' : 'todo',
        kind: kinds.includes(raw?.kind) ? raw.kind : 'outreach',
        owner: String(raw?.owner || 'founder').trim() || 'founder',
        dueDate: raw?.dueDate ? String(raw.dueDate).trim() : undefined,
        leadId: raw?.leadId ? String(raw.leadId).trim() : undefined
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

function coerceState(raw: any): SalesCockpitState {
    const defaults = createDefaultSalesCockpitState();
    const leads = Array.isArray(raw?.leads) ? raw.leads.map(sanitizeLead).filter(Boolean) as SalesCockpitLead[] : defaults.leads;
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) as SalesCockpitTask[] : defaults.tasks;
    const campaigns = Array.isArray(raw?.campaigns) ? raw.campaigns.map(sanitizeCampaign).filter(Boolean) as SalesCockpitCampaign[] : defaults.campaigns;
    const templates = Array.isArray(raw?.templates) ? raw.templates.map(sanitizeTemplate).filter(Boolean) as SalesCockpitTemplate[] : defaults.templates;

    return {
        version: FILE_VERSION,
        lastUpdatedAt: String(raw?.lastUpdatedAt || timestamp()),
        notes: String(raw?.notes || defaults.notes),
        weeklyTargets: {
            outbound: Number(raw?.weeklyTargets?.outbound || defaults.weeklyTargets.outbound),
            discovery: Number(raw?.weeklyTargets?.discovery || defaults.weeklyTargets.discovery),
            demos: Number(raw?.weeklyTargets?.demos || defaults.weeklyTargets.demos),
            proposals: Number(raw?.weeklyTargets?.proposals || defaults.weeklyTargets.proposals)
        },
        leads,
        tasks,
        campaigns,
        templates
    };
}

export async function readSalesCockpitFromWorkspace(): Promise<SalesCockpitState> {
    const uri = getSalesCockpitUri();
    if (!uri) return createDefaultSalesCockpitState();
    if (!(await fileExists(uri))) return createDefaultSalesCockpitState();
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return coerceState(JSON.parse(text));
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
    const next = coerceState({ ...state, lastUpdatedAt: timestamp() });
    const text = JSON.stringify(next, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    return next;
}

import {
    createSalesCockpitProduct,
    SalesCockpitProduct,
    SalesCockpitState,
    SalesCockpitTask,
    slugify
} from './salesCockpitStore';
import { readWorkspaceTextFile } from './workspaceFileService';

type IdeaSectionMap = Record<string, string>;

function parseMarkdownSections(markdown: string): IdeaSectionMap {
    const lines = String(markdown || '').split(/\r?\n/);
    const sections: IdeaSectionMap = {};
    let current = 'body';
    sections[current] = '';

    for (const rawLine of lines) {
        const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(rawLine);
        if (heading?.[1]) {
            current = heading[1].trim().toLowerCase();
            sections[current] = sections[current] || '';
            continue;
        }
        sections[current] = `${sections[current] || ''}${rawLine}\n`;
    }

    return Object.fromEntries(
        Object.entries(sections).map(([key, value]) => [key, value.trim()])
    );
}

function firstNonEmptyLine(markdown: string): string {
    return String(markdown || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .find(Boolean) || '';
}

function firstSentence(value: string, fallback: string): string {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return fallback;
    }
    const match = /^(.+?[.!?])(\s|$)/.exec(normalized);
    return (match?.[1] || normalized).trim();
}

function collectBulletItems(value: string): string[] {
    return String(value || '')
        .split(/\r?\n/)
        .map((line) => {
            const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
            const todo = /^\s*\[\s?\]\s+(.+?)\s*$/.exec(line);
            return (bullet?.[1] || todo?.[1] || '').trim();
        })
        .filter(Boolean);
}

function findSection(sections: IdeaSectionMap, ...keys: string[]): string {
    for (const key of keys) {
        const normalized = key.toLowerCase();
        const exact = sections[normalized];
        if (exact) {
            return exact;
        }
        const match = Object.entries(sections).find(([sectionKey]) => sectionKey.includes(normalized));
        if (match?.[1]) {
            return match[1];
        }
    }
    return '';
}

function buildWizardTasks(product: SalesCockpitProduct, bullets: string[]): SalesCockpitTask[] {
    const tasks: SalesCockpitTask[] = [
        {
            id: `${product.slug}-task-attach-pipelines`,
            title: 'Attach 1 to 3 intent_router pipelines',
            status: 'todo',
            kind: 'outreach',
            owner: 'founder',
            detail: 'Keep the product minimal: one interface and up to three pipelines.',
            sourceRef: product.ideaPath
        },
        {
            id: `${product.slug}-task-connect-google`,
            title: 'Connect Google Workspace and Gmail',
            status: 'todo',
            kind: 'follow_up',
            owner: 'founder',
            detail: 'Use the cockpit Providers page to connect the Google surfaces for this SaaS.',
            sourceRef: product.ideaPath
        },
        {
            id: `${product.slug}-task-build-offer-proof`,
            title: 'Capture one proof asset for the offer',
            status: 'todo',
            kind: 'proof',
            owner: 'founder',
            detail: 'Add one run, screenshot, or measurable result to the Proof Locker.',
            sourceRef: product.ideaPath
        }
    ];

    for (const bullet of bullets.slice(0, 4)) {
        tasks.push({
            id: `${product.slug}-task-idea-${slugify(bullet)}`,
            title: bullet,
            status: 'todo',
            kind: 'friction',
            owner: 'founder',
            detail: 'Imported from idea.md.',
            sourceRef: product.ideaPath
        });
    }

    return tasks;
}

export async function createProductFromIdeaPath(state: SalesCockpitState, ideaPath: string): Promise<SalesCockpitState> {
    const markdown = await readWorkspaceTextFile(ideaPath);
    const sections = parseMarkdownSections(markdown);
    const title = firstSentence(
        findSection(sections, 'product', 'title', 'name') || firstNonEmptyLine(markdown).replace(/^#\s+/, ''),
        'New Leion Product'
    );

    const product = createSalesCockpitProduct(title);
    const bullets = [
        ...collectBulletItems(findSection(sections, 'next steps', 'tasks', 'plan')),
        ...collectBulletItems(findSection(sections, 'notes', 'constraints'))
    ];

    product.ideaPath = ideaPath;
    product.stage = 'offer';
    product.notes = [
        'Generated from idea.md.',
        '',
        firstSentence(findSection(sections, 'summary', 'overview') || findSection(sections, 'body'), 'No summary extracted yet.')
    ].join('\n');
    product.offer = {
        name: title,
        audience: firstSentence(findSection(sections, 'audience', 'icp', 'buyer'), product.offer.audience),
        problem: firstSentence(findSection(sections, 'problem', 'pain'), product.offer.problem),
        promise: firstSentence(findSection(sections, 'promise', 'solution', 'offer'), product.offer.promise),
        proof: firstSentence(findSection(sections, 'proof', 'evidence'), product.offer.proof),
        callToAction: firstSentence(findSection(sections, 'cta', 'call to action', 'next step'), product.offer.callToAction)
    };
    product.funnel = {
        acquisition: firstSentence(findSection(sections, 'acquisition', 'channel'), product.funnel.acquisition),
        qualification: firstSentence(findSection(sections, 'qualification', 'qualify'), product.funnel.qualification),
        demo: firstSentence(findSection(sections, 'demo'), product.funnel.demo),
        proposal: firstSentence(findSection(sections, 'proposal', 'pricing'), product.funnel.proposal),
        close: firstSentence(findSection(sections, 'close', 'conversion'), product.funnel.close)
    };
    product.tasks = buildWizardTasks(product, bullets);
    product.templates = product.templates.map((template) => template.id === 'tpl-founder-email'
        ? {
            ...template,
            subject: `${title} for teams with repeated delivery friction`
        }
        : template
    );

    const existingIndex = state.products.findIndex((entry) => entry.id === product.id || entry.slug === product.slug);
    const products = existingIndex >= 0
        ? state.products.map((entry, index) => index === existingIndex ? product : entry)
        : [...state.products, product];

    return {
        ...state,
        activeProductId: product.id,
        products,
        notes: product.notes,
        offer: product.offer,
        funnel: product.funnel,
        weeklyTargets: product.weeklyTargets,
        leads: product.leads,
        tasks: product.tasks,
        campaigns: product.campaigns,
        templates: product.templates,
        draftQueue: product.draftQueue,
        providerAccounts: state.providerAccounts,
        proofAssets: product.proofAssets,
        pipelinePaths: product.pipelinePaths,
        ideaPath: product.ideaPath,
        implementPath: product.implementPath,
        defaultSheetUrl: product.defaultSheetUrl,
        productStage: product.stage
    };
}

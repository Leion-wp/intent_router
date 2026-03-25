import { SalesCockpitState, SalesCockpitTask, slugify } from './salesCockpitStore';
import { readWorkspaceTextFile } from './workspaceFileService';

type ExtractedFriction = {
    title: string;
    detail: string;
    sourceRef: string;
};

function extractFrictionLines(markdown: string, implementPath: string): ExtractedFriction[] {
    const results: ExtractedFriction[] = [];
    const lines = String(markdown || '').split(/\r?\n/);
    let currentHeading = 'implement';

    lines.forEach((line, index) => {
        const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(line);
        if (heading?.[1]) {
            currentHeading = heading[1].trim();
            return;
        }

        const bullet = /^\s*(?:[-*]|\[\s?\])\s+(.+?)\s*$/.exec(line);
        const tagged = /^\s*(?:FRICTION|BLOCKER|ISSUE|PAIN|TODO)\s*:\s*(.+?)\s*$/i.exec(line);
        const content = (tagged?.[1] || bullet?.[1] || '').trim();
        if (!content) {
            return;
        }

        if (!/friction|blocker|issue|pain|todo|stuck|slow|manual|problem/i.test(line)) {
            return;
        }

        results.push({
            title: content,
            detail: `Imported from ${currentHeading}.`,
            sourceRef: `${implementPath}:L${index + 1}`
        });
    });

    return results;
}

export async function extractFrictionTasks(state: SalesCockpitState, implementPath: string): Promise<{
    nextState: SalesCockpitState;
    importedCount: number;
}> {
    const markdown = await readWorkspaceTextFile(implementPath);
    const extracted = extractFrictionLines(markdown, implementPath);
    const existing = new Set(state.tasks.map((task) => task.id));
    const tasks: SalesCockpitTask[] = [...state.tasks];

    for (const friction of extracted) {
        const id = `${slugify(state.offer.name)}-friction-${slugify(friction.title)}`;
        if (existing.has(id)) {
            continue;
        }
        tasks.push({
            id,
            title: friction.title,
            status: 'todo',
            kind: 'friction',
            owner: 'founder',
            detail: friction.detail,
            sourceRef: friction.sourceRef
        });
        existing.add(id);
    }

    return {
        nextState: {
            ...state,
            implementPath,
            tasks
        },
        importedCount: tasks.length - state.tasks.length
    };
}

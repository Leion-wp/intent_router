import { Intent } from '../types';

export type PipelineFile = {
    name: string;
    profile?: string;
    steps: Array<Intent>;
};

export function parsePipeline(text: string): PipelineFile {
    let pipeline: PipelineFile;
    try {
        pipeline = JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid pipeline JSON: ${error}`);
    }

    if (!pipeline || !Array.isArray(pipeline.steps)) {
        throw new Error('Invalid pipeline: expected a "steps" array.');
    }

    return pipeline;
}

// Helper to resolve ${var:name} from store
export function resolveTemplateVariables(input: any, store: Map<string, any>): any {
    if (typeof input === 'string') {
        return input.replace(/\$\{var:([^}]+)\}/g, (match, varName) => {
            const key = typeof varName === 'string' ? varName.trim() : '';
            return key && store.has(key) ? String(store.get(key)) : match;
        });
    } else if (Array.isArray(input)) {
        return input.map(item => resolveTemplateVariables(item, store));
    } else if (typeof input === 'object' && input !== null) {
        const resolved: any = {};
        for (const key of Object.keys(input)) {
            resolved[key] = resolveTemplateVariables(input[key], store);
        }
        return resolved;
    }
    return input;
}

// Helper to compile high-level intents to terminal.run
export function transformToTerminal(intent: Intent, cwd: string): Intent {
    const { intent: name, payload } = intent;

    // Pass through if not a compile target
    if (!name.startsWith('git.') && !name.startsWith('docker.')) {
        return intent;
    }

    let command = '';

    switch (name) {
        case 'git.checkout': {
            const branch = payload?.branch;
            const create = payload?.create;
            if (!branch) throw new Error('git.checkout requires "branch"');
            command = `git checkout ${create ? '-b ' : ''}${branch}`;
            break;
        }
        case 'git.commit': {
            const message = payload?.message;
            const amend = payload?.amend;
            if (!message) throw new Error('git.commit requires "message"');
            command = `git commit ${amend ? '--amend ' : ''}-m "${message}"`;
            break;
        }
        case 'git.pull':
            command = 'git pull';
            break;
        case 'git.push':
            command = 'git push';
            break;
        case 'git.clone': {
             const url = payload?.url;
             const dir = payload?.dir;
             if (!url) throw new Error('git.clone requires "url"');
             command = `git clone ${url}${dir ? ` ${dir}` : ''}`;
             break;
         }
        case 'docker.build': {
            const tag = payload?.tag;
            const path = payload?.path || '.';
            if (!tag) throw new Error('docker.build requires "tag"');
            command = `docker build -t ${tag} ${path}`;
            break;
        }
        case 'docker.run': {
            const image = payload?.image;
            const detach = payload?.detach;
            if (!image) throw new Error('docker.run requires "image"');
            command = `docker run ${detach ? '-d ' : ''}${image}`;
            break;
        }
        default:
            return intent; // Not a target for compilation
    }

    return {
        ...intent,
        intent: 'terminal.run', // Transform intent ID
        capabilities: ['terminal.run'],
        payload: {
            command,
            cwd
        },
        description: intent.description || `Compiled: ${command}`
    };
}

// Compiler entry point
export async function compileStep(step: Intent, variableStore: Map<string, any>, cwd: string): Promise<Intent> {
    // 1. Resolve variables
    const resolvedPayload = resolveTemplateVariables(step.payload, variableStore);

    const resolvedStep = {
        ...step,
        payload: resolvedPayload
    };

    // 2. Transform to terminal if needed
    return transformToTerminal(resolvedStep, cwd);
}

export function applyDefaultCwd(payload: any, cwd: string): any {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return payload;
    }
    if (payload.cwd === undefined || payload.cwd === null || payload.cwd === '' || payload.cwd === '.' || payload.cwd === '${workspaceRoot}') {
        return { ...payload, cwd };
    }
    return payload;
}

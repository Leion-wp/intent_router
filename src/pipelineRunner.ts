import * as vscode from 'vscode';
import { Intent } from './types';
import { routeIntent } from './router';
import { pipelineEventBus } from './eventBus';
import { generateSecureToken } from './security';

export type PipelineFile = {
    name: string;
    profile?: string;
    steps: Array<Intent>;
};

let currentRunId: string | null = null;
let isCancelled = false;
let isPaused = false;

export function cancelCurrentPipeline() {
    if (currentRunId) {
        isCancelled = true;
        vscode.window.showInformationMessage('Pipeline cancellation requested.');
        // If paused, we need to unpause to let the loop exit (or handle in loop)
        // But since we are checking isCancelled in the loop, we might be stuck in the pause loop.
        // We will handle this in the runPipeline loop.
    }
}

export function pauseCurrentPipeline() {
    if (currentRunId && !isPaused) {
        isPaused = true;
        pipelineEventBus.emit({ type: 'pipelinePause', runId: currentRunId, timestamp: Date.now() });
        vscode.window.showInformationMessage('Pipeline paused.');
    }
}

export function resumeCurrentPipeline() {
    if (currentRunId && isPaused) {
        isPaused = false;
        pipelineEventBus.emit({ type: 'pipelineResume', runId: currentRunId, timestamp: Date.now() });
        vscode.window.showInformationMessage('Pipeline resumed.');
    }
}

export async function runPipelineFromActiveEditor(dryRun: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Open a .intent.json file to run a pipeline.');
        return;
    }

    const pipeline = parsePipeline(editor.document.getText());
    if (!pipeline) {
        return;
    }

    await runPipelineFromData(pipeline, dryRun);
}

export async function runPipelineFromUri(uri: vscode.Uri, dryRun: boolean): Promise<void> {
    const pipeline = await readPipelineFromUri(uri);
    if (!pipeline) {
        return;
    }

    await runPipelineFromData(pipeline, dryRun);
}

export async function readPipelineFromUri(uri: vscode.Uri): Promise<PipelineFile | undefined> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return parsePipeline(text);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read pipeline: ${error}`);
        return undefined;
    }
}

export async function writePipelineToUri(uri: vscode.Uri, pipeline: PipelineFile): Promise<void> {
    const content = JSON.stringify(pipeline, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

export async function ensurePipelineFolder(): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'pipeline');
    await vscode.workspace.fs.createDirectory(folderUri);
    return folderUri;
}

export async function runPipelineFromData(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    await runPipeline(pipeline, dryRun);
}

function parsePipeline(text: string): PipelineFile | undefined {
    let pipeline: PipelineFile;
    try {
        pipeline = JSON.parse(text);
    } catch (error) {
        vscode.window.showErrorMessage(`Invalid pipeline JSON: ${error}`);
        return undefined;
    }

    if (!pipeline || !Array.isArray(pipeline.steps)) {
        vscode.window.showErrorMessage('Invalid pipeline: expected a "steps" array.');
        return undefined;
    }

    return pipeline;
}

// Helper to resolve ${var:name} from store
function resolveTemplateVariables(input: any, store: Map<string, any>): any {
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
function transformToTerminal(intent: Intent, cwd: string): Intent {
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

async function runPipeline(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    // Reset state
    isCancelled = false;
    isPaused = false;

    const config = vscode.workspace.getConfiguration('intentRouter');
    const originalProfile = config.get<string>('activeProfile', '');
    const targetProfile = pipeline.profile ?? '';
    if (targetProfile && targetProfile !== originalProfile) {
        await config.update('activeProfile', targetProfile, true);
    }

    const variableCache = new Map<string, string>(); // cache for ${input:...}
    const variableStore = new Map<string, any>(); // store for ${var:...}

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    let currentCwd = workspaceRoot ?? '.';
    const runId = Date.now().toString(36); // Simple run ID
    currentRunId = runId;

    pipelineEventBus.emit({
        type: 'pipelineStart',
        runId,
        timestamp: Date.now(),
        totalSteps: pipeline.steps.length,
        name: pipeline.name,
        pipeline: pipeline // Pass the full pipeline definition
    });

    try {
        let currentIndex = 0;
        while (currentIndex < pipeline.steps.length) {
            // Check for pause/cancel before step
            while (isPaused && !isCancelled) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (isCancelled) {
                vscode.window.showWarningMessage('Pipeline cancelled by user.');
                pipelineEventBus.emit({
                    type: 'pipelineEnd',
                    runId,
                    timestamp: Date.now(),
                    success: false,
                    status: 'cancelled'
                });
                return;
            }

            const step = pipeline.steps[currentIndex];

            // Built-in flow-control steps used by the builder (handled here, not as VS Code commands).
            // RepoNode -> system.setCwd
            if (step.intent === 'system.setCwd') {
                const rawPath = (step.payload as any)?.path;
                if (typeof rawPath === 'string' && rawPath.trim()) {
                    const normalized = rawPath.trim() === '${workspaceRoot}' && workspaceRoot ? workspaceRoot : rawPath.trim();
                    currentCwd = normalized;
                } else if (workspaceRoot) {
                    currentCwd = workspaceRoot;
                }

                const intentId = generateSecureToken(8);
                pipelineEventBus.emit({
                    type: 'stepStart',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    description: step.description,
                    index: currentIndex
                });
                pipelineEventBus.emit({
                    type: 'stepEnd',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    success: true,
                    index: currentIndex
                });
                currentIndex++;
                continue;
            }

            // PromptNode -> system.setVar
            if (step.intent === 'system.setVar') {
                const name = (step.payload as any)?.name;
                const value = (step.payload as any)?.value;
                if (typeof name === 'string' && name.trim() && typeof value === 'string') {
                    variableCache.set(name.trim(), value);
                }

                const intentId = generateSecureToken(8);
                pipelineEventBus.emit({
                    type: 'stepStart',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    description: step.description,
                    index: currentIndex
                });
                pipelineEventBus.emit({
                    type: 'stepEnd',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    success: true,
                    index: currentIndex
                });
                currentIndex++;
                continue;
            }

            const stepIntent: Intent = {
                ...step,
                description: step.description,
                payload: step.intent === 'terminal.run' ? applyDefaultCwd(step.payload, currentCwd) : step.payload,
                meta: {
                    ...(step.meta ?? {}),
                    dryRun: dryRun ? true : step.meta?.dryRun
                }
            };

            // Resolve variables for compilation
            // We use compileStep to handle both var resolution AND terminal transformation
            let compiledStep: Intent;
            try {
                compiledStep = await compileStep(stepIntent, variableCache, currentCwd);
            } catch (error) {
                 vscode.window.showErrorMessage(`Compilation failed at step ${currentIndex}: ${error}`);
                 throw error;
            }

            // Check for internal system intents *after* variable resolution (in case values were vars)
            // But compileStep transforms git/docker. system.* should be preserved by default.

            if (compiledStep.intent === 'system.setVar') {
                 const name = compiledStep.payload?.name;
                 const value = compiledStep.payload?.value;
                 if (name && value !== undefined) {
                     variableCache.set(name, value);
                     // Emit success for this "virtual" step
                     const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);
                     pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: `Set var ${name}`, index: currentIndex });
                     pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: true, index: currentIndex });
                 }
                 currentIndex++;
                 continue; // Skip routing
            }

            if (compiledStep.intent === 'system.setCwd') {
                 const path = compiledStep.payload?.path;
                 if (path) {
                     currentCwd = path;
                     // Emit success for this "virtual" step
                     const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);
                     pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: `Set cwd to ${path}`, index: currentIndex });
                     pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: true, index: currentIndex });
                 }
                 currentIndex++;
                 continue; // Skip routing
            }

            const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);

            // Emit index so frontend can map to node
            pipelineEventBus.emit({
                type: 'stepStart',
                runId,
                intentId,
                timestamp: Date.now(),
                description: compiledStep.description,
                index: currentIndex
            });

            // Ensure traceId and runId are in meta for routeIntent
            compiledStep.meta = {
                ...(compiledStep.meta || {}),
                traceId: intentId,
                runId: runId
            };

            // Route the compiled intent
            const ok = await routeIntent(compiledStep, variableCache);

            pipelineEventBus.emit({
                type: 'stepEnd',
                runId,
                intentId,
                timestamp: Date.now(),
                success: ok,
                index: currentIndex
            });

            if (ok) {
                currentIndex++;
            } else {
                if (step.onFailure) {
                    const nextIndex = pipeline.steps.findIndex(s => s.id === step.onFailure);
                    if (nextIndex !== -1) {
                         currentIndex = nextIndex;
                         continue;
                    }
                }

                vscode.window.showWarningMessage('Pipeline stopped on failed step.');
                pipelineEventBus.emit({
                    type: 'pipelineEnd',
                    runId,
                    timestamp: Date.now(),
                    success: false,
                    status: 'failure'
                });
                return;
            }
        }
        pipelineEventBus.emit({
            type: 'pipelineEnd',
            runId,
            timestamp: Date.now(),
            success: true,
            status: 'success'
        });
    } catch (e) {
        pipelineEventBus.emit({
            type: 'pipelineEnd',
            runId,
            timestamp: Date.now(),
            success: false,
            status: 'failure'
        });
        throw e;
    } finally {
        currentRunId = null;
        if (targetProfile && targetProfile !== originalProfile) {
            await config.update('activeProfile', originalProfile, true);
        }
    }
}

function applyDefaultCwd(payload: any, cwd: string): any {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return payload;
    }
    if (payload.cwd === undefined || payload.cwd === null || payload.cwd === '' || payload.cwd === '.' || payload.cwd === '${workspaceRoot}') {
        return { ...payload, cwd };
    }
    return payload;
}

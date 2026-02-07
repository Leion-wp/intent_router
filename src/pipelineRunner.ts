import * as vscode from 'vscode';
import * as path from 'path';
import { Intent } from './types';
import { routeIntent } from './router';
import { pipelineEventBus } from './eventBus';
import { generateSecureToken, validateStrictShellArg, sanitizeShellArg, validateSafeRelativePath } from './security';
import { listPublicCapabilities } from './registry';
import { Determinism } from './types';

export type PipelineFile = {
    name: string;
    description?: string;
    profile?: string;
    steps: Array<Intent>;
    meta?: {
        ui?: {
            nodes: any[];
            edges: any[];
            viewport?: any;
        };
        [key: string]: any;
    };
};

let currentRunId: string | null = null;
let isCancelled = false;
let isPaused = false;

function canonicalizeCapabilityId(capability: string): string {
    const raw = (capability ?? '').trim();
    if (!raw) {
        return raw;
    }

    const parts = raw.split('.').filter(Boolean);
    if (parts.length < 3) {
        return raw;
    }

    const first = parts[0];
    let i = 1;
    while (i < parts.length - 1 && parts[i] === first) {
        i += 1;
    }
    if (i === 1) {
        return raw;
    }

    return [first, ...parts.slice(i)].join('.');
}

function buildDeterminismMap(): Map<string, Determinism> {
    const map = new Map<string, Determinism>();
    const caps = listPublicCapabilities();
    for (const cap of caps as any[]) {
        if (cap?.capability && (cap.determinism === 'deterministic' || cap.determinism === 'interactive')) {
            map.set(String(cap.capability), cap.determinism as Determinism);
        }
    }
    return map;
}

function isInteractiveIntent(intent: Intent, determinismByCapability: Map<string, Determinism>): boolean {
    const rawCaps = (intent.capabilities && intent.capabilities.length > 0) ? intent.capabilities : [intent.intent];
    const caps = rawCaps.map(canonicalizeCapabilityId);
    for (const cap of caps) {
        const d = determinismByCapability.get(cap);
        if (d === 'interactive') {
            return true;
        }
    }
    return false;
}

export function cancelCurrentPipeline() {
    if (currentRunId) {
        isCancelled = true;
        vscode.window.showInformationMessage('Pipeline cancellation requested.');
        try {
            void vscode.commands.executeCommand('intentRouter.internal.terminalCancel', { runId: currentRunId });
        } catch {
            // Best-effort cancellation.
        }
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
function transformToTerminal(intent: Intent, cwd: string, trustedRoot: string): Intent {
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

            validateStrictShellArg(branch, 'branch');
            command = `git checkout ${create ? '-b ' : ''}${branch}`;
            break;
        }
        case 'git.commit': {
            const message = payload?.message;
            const amend = payload?.amend;
            if (!message) throw new Error('git.commit requires "message"');

            const safeMessage = sanitizeShellArg(message);
            command = `git commit ${amend ? '--amend ' : ''}-m ${safeMessage}`;
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

             const safeUrl = sanitizeShellArg(url);
             let dirPart = '';
             if (dir) {
                 validateStrictShellArg(dir, 'dir');
                 validateSafeRelativePath(dir, trustedRoot, cwd);
                 dirPart = ` ${dir}`;
             }
             command = `git clone ${safeUrl}${dirPart}`;
             break;
         }
        case 'docker.build': {
            const tag = payload?.tag;
            const path = payload?.path || '.';
            if (!tag) throw new Error('docker.build requires "tag"');

            validateStrictShellArg(tag, 'tag');
            validateStrictShellArg(path, 'path');
            validateSafeRelativePath(path, trustedRoot, cwd);
            command = `docker build -t ${tag} ${path}`;
            break;
        }
        case 'docker.run': {
            const image = payload?.image;
            const detach = payload?.detach;
            if (!image) throw new Error('docker.run requires "image"');

            validateStrictShellArg(image, 'image');
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
export async function compileStep(step: Intent, variableStore: Map<string, any>, cwd: string, trustedRoot: string): Promise<Intent> {
    // 1. Resolve variables
    const resolvedPayload = resolveTemplateVariables(step.payload, variableStore);

    const resolvedStep = {
        ...step,
        payload: resolvedPayload
    };

    // 2. Transform to terminal if needed
    return transformToTerminal(resolvedStep, cwd, trustedRoot);
}

function buildStepAdjacency(pipeline: PipelineFile): Map<string, Set<string>> {
    const stepIds = new Set((pipeline.steps || []).map((s: any) => String(s?.id || '').trim()).filter(Boolean));
    const adj = new Map<string, Set<string>>();
    for (const id of stepIds) {
        adj.set(id, new Set<string>());
    }

    const edges = Array.isArray(pipeline.meta?.ui?.edges) ? (pipeline.meta!.ui!.edges as any[]) : [];
    for (const e of edges) {
        const source = String(e?.source || '').trim();
        const target = String(e?.target || '').trim();
        if (!source || !target) continue;
        if (!stepIds.has(source) || !stepIds.has(target)) continue;
        if (!adj.has(source)) adj.set(source, new Set<string>());
        adj.get(source)!.add(target);
    }
    return adj;
}

function reachableFrom(starts: string[], adj: Map<string, Set<string>>): Set<string> {
    const q = starts.filter(Boolean);
    const seen = new Set<string>();
    while (q.length > 0) {
        const u = q.shift()!;
        if (seen.has(u)) continue;
        seen.add(u);
        const next = adj.get(u);
        if (!next) continue;
        for (const v of next) {
            if (!seen.has(v)) q.push(v);
        }
    }
    return seen;
}

function computeSwitchBlockedSteps(
    pipeline: PipelineFile,
    chosenTarget: string,
    allTargets: string[]
): Set<string> {
    const distinct = Array.from(new Set(allTargets.map(s => String(s || '').trim()).filter(Boolean)));
    if (!chosenTarget || distinct.length === 0) return new Set<string>();

    const others = distinct.filter(t => t !== chosenTarget);
    if (others.length === 0) return new Set<string>();

    const adj = buildStepAdjacency(pipeline);
    if (adj.size === 0) {
        return new Set<string>(others);
    }

    const chosenReach = reachableFrom([chosenTarget], adj);
    const otherReach = reachableFrom(others, adj);
    const blocked = new Set<string>();
    for (const id of otherReach) {
        if (!chosenReach.has(id)) blocked.add(id);
    }
    return blocked;
}

type FormField = {
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    label?: string;
    key: string;
    default?: string;
    required?: boolean;
    options?: string | string[];
    secret?: boolean;
};

async function runFormStep(
    runId: string,
    step: Intent,
    variableCache: Map<string, string>,
    index: number
): Promise<void> {
    const intentId = step.meta?.traceId ?? generateSecureToken(8);
    const stepId = step.id;
    const fields = Array.isArray(step.payload?.fields) ? (step.payload.fields as FormField[]) : [];

    pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: step.description || 'Form', index, stepId });

    const decidedAt = new Date().toISOString();
    pipelineEventBus.emit({
        type: 'stepLog',
        runId,
        intentId,
        stepId,
        text: `[form] decisionRecord=${decidedAt}`,
        stream: 'stdout'
    });

    for (const raw of fields) {
        const key = String((raw as any)?.key || '').trim();
        if (!key) {
            continue;
        }
        const type = String((raw as any)?.type || 'text') as FormField['type'];
        const label = String((raw as any)?.label || key).trim();
        const required = !!(raw as any)?.required;
        const secret = !!(raw as any)?.secret;
        const def = (raw as any)?.default !== undefined ? String((raw as any).default) : '';

        let value: string | undefined;
        while (true) {
            if (type === 'select') {
                const optsRaw = (raw as any)?.options;
                const opts = Array.isArray(optsRaw)
                    ? optsRaw.map((x: any) => String(x).trim()).filter(Boolean)
                    : String(optsRaw || '').split(',').map(s => s.trim()).filter(Boolean);

                value = await vscode.window.showQuickPick(opts.length ? opts : [''], {
                    placeHolder: `${label} (${key})`,
                    ignoreFocusOut: true
                });
            } else if (type === 'checkbox') {
                const initial = (def || '').toLowerCase() === 'true' ? 'true' : 'false';
                value = await vscode.window.showQuickPick(['true', 'false'], {
                    placeHolder: `${label} (${key})`,
                    ignoreFocusOut: true
                });
                if (value === undefined) value = undefined;
                if (!value) value = initial;
            } else {
                value = await vscode.window.showInputBox({
                    prompt: `${label} (${key})`,
                    value: def,
                    password: secret,
                    ignoreFocusOut: true
                });
            }

            if (value === undefined) {
                throw new Error(`Input cancelled for variable: ${key}`);
            }

            const trimmed = String(value).trim();
            if (required && !trimmed) {
                vscode.window.showErrorMessage(`"${key}" is required.`);
                continue;
            }
            value = trimmed;
            break;
        }

        variableCache.set(key, value);
        const masked = secret ? '***' : value;
        pipelineEventBus.emit({
            type: 'stepLog',
            runId,
            intentId,
            stepId,
            text: `[form] ${key}=${masked}`,
            stream: 'stdout'
        });
    }

    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: true, index, stepId });
}

type SwitchRoute = {
    label?: string;
    condition?: string;
    value?: string;
    equalsValue?: string;
    targetStepId?: string;
};

type ResolvedSwitchRoute = {
    label: string;
    condition: 'equals' | 'exists' | 'contains' | 'regex';
    value: string;
    targetStepId: string;
};

function resolveVariableValue(
    variableCache: Map<string, string>,
    variableKey: string
): { value: string; resolvedKey: string } {
    const direct = variableCache.get(variableKey);
    if (direct !== undefined) {
        return { value: String(direct), resolvedKey: variableKey };
    }

    const wanted = variableKey.toLowerCase();
    for (const [key, value] of variableCache.entries()) {
        if (key.toLowerCase() === wanted) {
            return { value: String(value), resolvedKey: key };
        }
    }

    return { value: '', resolvedKey: variableKey };
}

function normalizeSwitchEqualsValue(raw: unknown): string {
    const trimmed = String(raw ?? '').trim();
    const match = /^equals\s+(.+)$/i.exec(trimmed);
    return String(match?.[1] ?? trimmed).trim();
}

function normalizeSwitchCondition(raw: unknown): 'equals' | 'exists' | 'contains' | 'regex' {
    const value = String(raw ?? '').trim().toLowerCase();
    if (value === 'exists' || value === 'contains' || value === 'regex') {
        return value;
    }
    return 'equals';
}

function matchesSwitchRoute(currentValue: string, route: ResolvedSwitchRoute): boolean {
    const probe = String(currentValue ?? '');
    const routeValue = String(route.value ?? '');
    switch (route.condition) {
        case 'exists':
            return probe.trim().length > 0;
        case 'contains':
            return routeValue.length > 0 && probe.includes(routeValue);
        case 'regex':
            if (!routeValue) return false;
            try {
                return new RegExp(routeValue).test(probe);
            } catch {
                return false;
            }
        case 'equals':
        default:
            return probe === routeValue;
    }
}

function resolveSwitchRoutesFromMeta(
    pipeline: PipelineFile,
    switchStepId: string,
    routes: any[],
    defaultStepId: string
): { routes: ResolvedSwitchRoute[]; defaultStepId: string } {
    const edges = Array.isArray(pipeline.meta?.ui?.edges) ? (pipeline.meta!.ui!.edges as any[]) : [];

    const resolvedRoutes: ResolvedSwitchRoute[] = routes.map((r, i) => {
        let target = String(r?.targetStepId || '').trim();
        if (!target && switchStepId) {
            const handleId = `route_${i}`;
            const edge = edges.find((e: any) =>
                String(e?.source || '').trim() === switchStepId
                && String(e?.sourceHandle || '').trim() === handleId
            );
            target = String(edge?.target || '').trim();
        }

        return {
            label: String(r?.label || `route_${i}`),
            condition: normalizeSwitchCondition(r?.condition),
            value: normalizeSwitchEqualsValue(r?.value ?? r?.equalsValue),
            targetStepId: target
        };
    });

    let resolvedDefault = String(defaultStepId || '').trim();
    if (!resolvedDefault && switchStepId) {
        const defaultEdge = edges.find((e: any) =>
            String(e?.source || '').trim() === switchStepId
            && String(e?.sourceHandle || '').trim() === 'default'
        );
        resolvedDefault = String(defaultEdge?.target || '').trim();
    }

    return { routes: resolvedRoutes, defaultStepId: resolvedDefault };
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

    // Cache for ${input:...} and store for ${var:...} (environment variables)
    const variableCache = new Map<string, string>();

    const ciStrict = config.get<boolean>('policy.ciStrict', false);
    const interactiveBehavior = config.get<'confirm' | 'allow'>('policy.interactiveBehavior', 'confirm');
    const determinismByCapability = buildDeterminismMap();

    // Load global environment into variableCache
    const globalEnv = config.get<Record<string, string>>('environment') || {};
    for (const [key, value] of Object.entries(globalEnv)) {
        if (typeof value === 'string') {
            variableCache.set(key, value);
        }
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    let currentCwd = workspaceRoot ?? '.';
    const trustedRoot = workspaceRoot ?? path.resolve('.');
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
        const blockedStepIds = new Set<string>();
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
            const stepId = String(step?.id || '').trim();
            if (stepId && blockedStepIds.has(stepId)) {
                currentIndex++;
                continue;
            }

            // Built-in flow-control steps used by the builder (handled here, not as VS Code commands).
            // RepoNode -> system.setCwd
            if (step.intent === 'system.setCwd') {
                const rawPath = (step.payload as any)?.path;
                if (typeof rawPath === 'string' && rawPath.trim()) {
                    const normalized = rawPath.trim() === '${workspaceRoot}' && workspaceRoot ? workspaceRoot : rawPath.trim();
                    validateSafeRelativePath(normalized, trustedRoot, currentCwd);
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
                    index: currentIndex,
                    stepId: step.id
                });
                pipelineEventBus.emit({
                    type: 'stepEnd',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    success: true,
                    index: currentIndex,
                    stepId: step.id
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
                    index: currentIndex,
                    stepId: step.id
                });
                pipelineEventBus.emit({
                    type: 'stepEnd',
                    runId,
                    intentId,
                    timestamp: Date.now(),
                    success: true,
                    index: currentIndex,
                    stepId: step.id
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

            const interactive = isInteractiveIntent(stepIntent, determinismByCapability);
            if (interactive) {
                if (ciStrict) {
                    vscode.window.showErrorMessage(
                        `Blocked interactive step by policy (CI strict): ${stepIntent.intent}. Disable "Intent Router: Policy › CI Strict" to allow interactive steps.`
                    );
                    pipelineEventBus.emit({
                        type: 'pipelineEnd',
                        runId,
                        timestamp: Date.now(),
                        success: false,
                        status: 'failure'
                    });
                    return;
                }

                if (interactiveBehavior === 'confirm' && stepIntent.intent !== 'system.pause') {
                    const selection = await vscode.window.showWarningMessage(
                        `Interactive step detected: ${stepIntent.intent}\nThis may open UI or require human input. Continue?`,
                        { modal: true },
                        'Continue',
                        'Cancel'
                    );

                    if (selection !== 'Continue') {
                        isCancelled = true;
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
                }
            }

            // Resolve variables for compilation
            // We use compileStep to handle both var resolution AND terminal transformation
            let compiledStep: Intent;
            try {
                compiledStep = await compileStep(stepIntent, variableCache, currentCwd, trustedRoot);
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

            if (compiledStep.intent === 'system.form') {
                 try {
                     await runFormStep(runId, compiledStep, variableCache, currentIndex);
                 } catch (e: any) {
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
                 currentIndex++;
                 continue; // Virtual step
            }

            if (compiledStep.intent === 'system.switch') {
                 const variableKey = String(compiledStep.payload?.variableKey || '').trim();
                 const resolvedVar = variableKey
                     ? resolveVariableValue(variableCache, variableKey)
                     : { value: '', resolvedKey: '' };
                 const currentValue = String(resolvedVar.value).trim();
                 const rawRoutes = Array.isArray(compiledStep.payload?.routes) ? (compiledStep.payload.routes as any[]) : [];
                 const rawDefaultStepId = String(compiledStep.payload?.defaultStepId || '').trim();
                 const resolvedSwitch = resolveSwitchRoutesFromMeta(
                     pipeline,
                     String(compiledStep.id || '').trim(),
                     rawRoutes,
                     rawDefaultStepId
                 );
                 const routes = resolvedSwitch.routes;
                 const defaultStepId = resolvedSwitch.defaultStepId;

                 // Emit virtual step logs + success
                 const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);
                 pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: compiledStep.description || 'Switch', index: currentIndex, stepId: compiledStep.id });

                 let targetStepId: string | undefined = undefined;
                 let chosenLabel = 'default';
                 for (const r of routes) {
                     const target = String(r.targetStepId || '').trim();
                     if (!target) continue;
                     if (matchesSwitchRoute(currentValue, r)) {
                         targetStepId = target;
                         chosenLabel = String(r.label || 'route');
                         break;
                     }
                 }
                 if (!targetStepId && defaultStepId) {
                     targetStepId = defaultStepId;
                 }

                 const allRouteTargets = [
                     ...routes.map((r: any) => String(r.targetStepId || '').trim()),
                     defaultStepId
                 ];
                 if (targetStepId) {
                     const toBlock = computeSwitchBlockedSteps(pipeline, targetStepId, allRouteTargets);
                     for (const id of toBlock) blockedStepIds.add(id);
                 }

                 pipelineEventBus.emit({
                     type: 'stepLog',
                     runId,
                     intentId,
                     stepId: compiledStep.id,
                     text: `switch(${variableKey}${resolvedVar.resolvedKey && resolvedVar.resolvedKey !== variableKey ? `->${resolvedVar.resolvedKey}` : ''}=${currentValue}) -> ${chosenLabel}`,
                     stream: 'stdout'
                 });

                 pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: compiledStep.id });

                 if (targetStepId) {
                     const nextIndex = pipeline.steps.findIndex(s => s.id === targetStepId);
                     if (nextIndex !== -1) {
                         currentIndex = nextIndex;
                         continue;
                     }
                     vscode.window.showWarningMessage(`Switch target not found: ${targetStepId}`);
                 }

                 currentIndex++;
                 continue; // Virtual step
            }

            if (compiledStep.intent === 'system.setCwd') {
                 const path = compiledStep.payload?.path;
                 if (path) {
                     validateSafeRelativePath(path, trustedRoot, currentCwd);
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
                index: currentIndex,
                stepId: compiledStep.id
            });

            // Ensure traceId and runId are in meta for routeIntent
            compiledStep.meta = {
                ...(compiledStep.meta || {}),
                traceId: intentId,
                runId: runId,
                stepId: compiledStep.id
            };

            // Route the compiled intent
            const ok = await routeIntent(compiledStep, variableCache);

            pipelineEventBus.emit({
                type: 'stepEnd',
                runId,
                intentId,
                timestamp: Date.now(),
                success: ok,
                index: currentIndex,
                stepId: compiledStep.id
            });

            if (ok) {
                currentIndex++;
            } else {
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

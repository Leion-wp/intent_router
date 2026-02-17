import * as vscode from 'vscode';
import * as path from 'path';
import { Intent } from './types';
import { routeIntent } from './router';
import { pipelineEventBus } from './eventBus';
import { generateSecureToken, validateStrictShellArg, sanitizeShellArg, validateSafeRelativePath } from './security';
import { listPublicCapabilities } from './registry';
import { Determinism } from './types';
import { clearRunMemory, isRunMemoryEnabled, queryRunMemory, saveRunMemory } from './runMemoryStore';

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

export type PipelineRunContext = {
    source?: 'manual' | 'cron' | 'webhook' | 'watch';
    triggerStepId?: string;
    runtimeVariables?: Record<string, string>;
};

export type PipelineRunResult = {
    runId: string;
    status: 'success' | 'failure' | 'cancelled';
    success: boolean;
};

type RuntimeSandboxPolicy = {
    allowNetwork: boolean;
    allowFileWrite: boolean;
    timeoutMs: number;
    maxCommandChars: number;
    allowedIntents: string[];
    maxNetworkOps: number;
    maxFileWrites: number;
};

type RuntimeSandboxUsage = {
    networkOps: number;
    fileWrites: number;
};

function parseCsvList(raw: any): string[] {
    if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    return String(raw || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function toPositiveInt(raw: any, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function toBool(raw: any, fallback: boolean): boolean {
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw || '').trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
}

function parseBoolean(raw: any, fallback: boolean): boolean {
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw || '').trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
}

function pickVariableSubset(source: Map<string, string>, variableKeys: string[]): Record<string, string> {
    if (!Array.isArray(variableKeys) || variableKeys.length === 0) {
        return Object.fromEntries(source.entries());
    }
    const result: Record<string, string> = {};
    for (const key of variableKeys) {
        if (!source.has(key)) continue;
        result[key] = String(source.get(key) || '');
    }
    return result;
}

function normalizeValueForMemory(value: any): any {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeValueForMemory(entry));
    }
    if (typeof value === 'object') {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return String(value);
        }
    }
    return String(value);
}

export function detectIntentUsesNetwork(intent: Intent): boolean {
    const intentName = String(intent.intent || '').trim().toLowerCase();
    if (
        intentName.startsWith('http.') ||
        intentName.startsWith('ai.') ||
        intentName.startsWith('github.') ||
        intentName.startsWith('docker.')
    ) {
        return true;
    }
    if (intentName !== 'terminal.run') return false;
    const command = String(intent.payload?.command || '').toLowerCase();
    return /(curl|wget|gh\s|git\s+(clone|pull|push|fetch)|npm\s+(install|i)\b|pnpm\s+add|yarn\s+add|pip\s+install|docker\s+(pull|push))/i.test(command);
}

export function detectIntentWritesFiles(intent: Intent): boolean {
    const intentName = String(intent.intent || '').trim().toLowerCase();
    if (intentName === 'vscode.reviewdiff') return true;
    if (intentName.startsWith('git.') || intentName.startsWith('docker.')) return true;
    if (intentName !== 'terminal.run') return false;
    const command = String(intent.payload?.command || '').toLowerCase();
    return /(>>?|set-content|add-content|out-file|\brm\b|\bdel\b|\bmv\b|\bmove-item\b|\bcp\b|\bcopy-item\b|\bmkdir\b|\bnew-item\b|\bni\b|\btouch\b)/i.test(command);
}

function resolveRuntimeSandboxPolicy(step: Intent): RuntimeSandboxPolicy {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const stepSandbox = step.payload?.__sandbox || step.payload?.sandbox || {};
    return {
        allowNetwork: toBool(stepSandbox?.allowNetwork, config.get<boolean>('runtime.sandbox.allowNetwork', true)),
        allowFileWrite: toBool(stepSandbox?.allowFileWrite, config.get<boolean>('runtime.sandbox.allowFileWrite', true)),
        timeoutMs: toPositiveInt(stepSandbox?.timeoutMs, config.get<number>('runtime.sandbox.timeoutMs', 120000)),
        maxCommandChars: toPositiveInt(stepSandbox?.maxCommandChars, config.get<number>('runtime.sandbox.maxCommandChars', 12000)),
        allowedIntents: parseCsvList(stepSandbox?.allowedIntents ?? config.get<string[]>('runtime.sandbox.allowedIntents', []))
            .map((entry) => entry.toLowerCase()),
        maxNetworkOps: toPositiveInt(stepSandbox?.maxNetworkOps, config.get<number>('runtime.sandbox.maxNetworkOps', 40)),
        maxFileWrites: toPositiveInt(stepSandbox?.maxFileWrites, config.get<number>('runtime.sandbox.maxFileWrites', 40))
    };
}

function checkRuntimeSandbox(step: Intent, policy: RuntimeSandboxPolicy, usage: RuntimeSandboxUsage): string | null {
    const intentName = String(step.intent || '').trim().toLowerCase();
    if (policy.allowedIntents.length > 0) {
        const allowed = policy.allowedIntents.some((prefix) => intentName === prefix || intentName.startsWith(`${prefix}.`));
        if (!allowed) {
            return `Intent blocked by allowlist: ${intentName}`;
        }
    }
    if (intentName === 'terminal.run') {
        const command = String(step.payload?.command || '');
        if (command.length > policy.maxCommandChars) {
            return `Terminal command exceeds sandbox maxCommandChars (${policy.maxCommandChars}).`;
        }
    }
    const usesNetwork = detectIntentUsesNetwork(step);
    if (usesNetwork) {
        if (!policy.allowNetwork) {
            return `Network access blocked by sandbox for intent ${intentName}.`;
        }
        if (usage.networkOps >= policy.maxNetworkOps) {
            return `Network quota exceeded (${policy.maxNetworkOps}).`;
        }
    }
    const writesFiles = detectIntentWritesFiles(step);
    if (writesFiles) {
        if (!policy.allowFileWrite) {
            return `File-write access blocked by sandbox for intent ${intentName}.`;
        }
        if (usage.fileWrites >= policy.maxFileWrites) {
            return `File-write quota exceeded (${policy.maxFileWrites}).`;
        }
    }
    return null;
}

let currentRunId: string | null = null;
let isCancelled = false;
let isPaused = false;

// Global registry for pending decisions
export function resolveDecision(nodeId: string, decision: 'approve' | 'reject', runId?: string, approvedPaths?: string[]) {
    pipelineEventBus.emit({
        type: 'pipelineDecision',
        nodeId,
        runId,
        approvedPaths,
        decision
    } as any);
}

function canonicalizeCapabilityId(capability: string): string {
    const raw = (capability ?? '').trim();
    if (!raw) return raw;
    const parts = raw.split('.').filter(Boolean);
    if (parts.length < 3) return raw;
    const first = parts[0];
    let i = 1;
    while (i < parts.length - 1 && parts[i] === first) i += 1;
    if (i === 1) return raw;
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
        if (d === 'interactive') return true;
    }
    return false;
}

export function cancelCurrentPipeline() {
    if (currentRunId) {
        isCancelled = true;
        vscode.window.showInformationMessage('Pipeline cancellation requested.');
    }
}

export function pauseCurrentPipeline() {
    if (currentRunId && !isPaused) {
        isPaused = true;
        pipelineEventBus.emit({ type: 'pipelinePause', runId: currentRunId, timestamp: Date.now() });
    }
}

export function resumeCurrentPipeline() {
    if (currentRunId && isPaused) {
        isPaused = false;
        pipelineEventBus.emit({ type: 'pipelineResume', runId: currentRunId, timestamp: Date.now() });
    }
}

export async function runPipelineFromActiveEditor(dryRun: boolean): Promise<PipelineRunResult | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const pipeline = parsePipeline(editor.document.getText());
    if (!pipeline) return;
    return await runPipelineFromData(pipeline, dryRun);
}

export async function runPipelineFromUri(uri: vscode.Uri, dryRun: boolean): Promise<PipelineRunResult | undefined> {
    const pipeline = await readPipelineFromUri(uri);
    if (!pipeline) return;
    return await runPipelineFromData(pipeline, dryRun);
}

export async function readPipelineFromUri(uri: vscode.Uri): Promise<PipelineFile | undefined> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return parsePipeline(text);
    } catch (error) { return undefined; }
}

export async function writePipelineToUri(uri: vscode.Uri, pipeline: PipelineFile): Promise<void> {
    const content = JSON.stringify(pipeline, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

export async function ensurePipelineFolder(): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return undefined;
    const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'pipeline');
    await vscode.workspace.fs.createDirectory(folderUri);
    return folderUri;
}

export async function runPipelineFromData(
    pipeline: PipelineFile,
    dryRun: boolean,
    startStepId?: string,
    context?: PipelineRunContext
): Promise<PipelineRunResult> {
    return await runPipeline(pipeline, dryRun, startStepId, context);
}

function seedVariableCacheFromEnvironment(store: Map<string, string>): void {
    const env = vscode.workspace.getConfiguration('intentRouter').get<Record<string, any>>('environment', {});
    if (!env || typeof env !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(env)) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) {
            continue;
        }
        store.set(normalizedKey, String(value ?? ''));
    }
}

function parsePipeline(text: string): PipelineFile | undefined {
    try {
        const pipeline = JSON.parse(text);
        if (!pipeline || !Array.isArray(pipeline.steps)) return undefined;
        return pipeline;
    } catch { return undefined; }
}

function resolveTemplateVariables(input: any, store: Map<string, string>): any {
    if (typeof input === 'string') {
        return input.replace(/\$\{var:([^}]+)\}/g, (match, varName) => {
            const key = varName.trim();
            return store.has(key) ? store.get(key)! : match;
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

function transformToTerminal(intent: Intent, cwd: string, trustedRoot: string): Intent {
    const { intent: name, payload } = intent;
    if (!name.startsWith('git.') && !name.startsWith('docker.')) return intent;

    let command = '';
    switch (name) {
        case 'git.checkout': command = `git checkout ${payload?.create ? '-b ' : ''}${payload?.branch}`; break;
        case 'git.commit': command = `git commit ${payload?.amend ? '--amend ' : ''}-m ${sanitizeShellArg(payload?.message)}`; break;
        case 'git.pull': command = 'git pull'; break;
        case 'git.push': command = 'git push'; break;
        case 'docker.build': command = `docker build -t ${payload?.tag} ${payload?.path || '.'}`; break;
        case 'docker.run': command = `docker run ${payload?.detach ? '-d ' : ''}${payload?.image}`; break;
        default: return intent;
    }

    return {
        ...intent,
        intent: 'terminal.run',
        capabilities: ['terminal.run'],
        payload: { command, cwd: normalizeCwd(payload?.cwd, cwd) },
        description: intent.description || `Compiled: ${command}`
    };
}

function resolveInitialCwd(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (workspaceRoot && workspaceRoot.trim()) {
        return workspaceRoot;
    }

    const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
    if (activePath && activePath.trim()) {
        const docDir = path.dirname(activePath);
        // Common case: pipeline file is in "<repo>/pipeline/*.intent.json"
        if (path.basename(docDir).toLowerCase() === 'pipeline') {
            return path.dirname(docDir);
        }
        return docDir;
    }

    return process.cwd();
}

export async function compileStep(step: Intent, variableStore: Map<string, string>, cwd: string, trustedRoot: string): Promise<Intent> {
    const resolvedPayload = resolveTemplateVariables(step.payload, variableStore);
    const resolvedStep = { ...step, payload: resolvedPayload };
    return transformToTerminal(resolvedStep, cwd, trustedRoot);
}

function buildStepAdjacency(pipeline: PipelineFile): Map<string, Set<string>> {
    const stepIds = new Set((pipeline.steps || []).map((s: any) => String(s?.id || '').trim()).filter(Boolean));
    const adj = new Map<string, Set<string>>();
    const edges = Array.isArray(pipeline.meta?.ui?.edges) ? (pipeline.meta!.ui!.edges as any[]) : [];
    for (const e of edges) {
        const source = String(e?.source || '').trim();
        const target = String(e?.target || '').trim();
        if (source && target && stepIds.has(source) && stepIds.has(target)) {
            if (!adj.has(source)) adj.set(source, new Set());
            adj.get(source)!.add(target);
        }
    }
    return adj;
}

function reachableFrom(starts: string[], adj: Map<string, Set<string>>): Set<string> {
    const q = [...starts];
    const seen = new Set<string>();
    while (q.length > 0) {
        const u = q.shift()!;
        if (seen.has(u)) continue;
        seen.add(u);
        adj.get(u)?.forEach(v => { if (!seen.has(v)) q.push(v); });
    }
    return seen;
}

function computeSwitchBlockedSteps(pipeline: PipelineFile, chosenTarget: string, allTargets: string[]): Set<string> {
    const others = allTargets.filter(t => t !== chosenTarget);
    if (others.length === 0) return new Set();
    const adj = buildStepAdjacency(pipeline);
    const chosenReach = reachableFrom([chosenTarget], adj);
    const otherReach = reachableFrom(others, adj);
    const blocked = new Set<string>();
    for (const id of otherReach) { if (!chosenReach.has(id)) blocked.add(id); }
    return blocked;
}

// RESTORED SWITCH LOGIC
function matchesSwitchRoute(currentValue: string, route: any): boolean {
    const probeRaw = String(currentValue ?? '');
    const routeValueRaw = String(route.value ?? '');
    const probe = probeRaw.trim();
    const routeValue = routeValueRaw.trim();
    switch (route.condition) {
        case 'exists': return probe.trim().length > 0;
        case 'contains': return probe.includes(routeValue);
        case 'regex': try { return new RegExp(routeValue).test(probe); } catch { return false; }
        case 'equals':
        default: return probe === routeValue;
    }
}

function seedVariableCacheFromRuntimeContext(store: Map<string, string>, context?: PipelineRunContext): void {
    if (!context?.runtimeVariables || typeof context.runtimeVariables !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(context.runtimeVariables)) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) continue;
        store.set(normalizedKey, String(value ?? ''));
    }
}

async function runPipeline(
    pipeline: PipelineFile,
    dryRun: boolean,
    startStepId?: string,
    context?: PipelineRunContext
): Promise<PipelineRunResult> {
    isCancelled = false;
    isPaused = false;
    let runStatus: 'success' | 'failure' | 'cancelled' = 'success';
    const variableCache = new Map<string, string>();
    seedVariableCacheFromEnvironment(variableCache);
    seedVariableCacheFromRuntimeContext(variableCache, context);
    const sandboxUsage: RuntimeSandboxUsage = { networkOps: 0, fileWrites: 0 };
    const stepResultCache = new Map<string, { intent: string; success: boolean; timestamp: number; output: any }>();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    let currentCwd = resolveInitialCwd();
    const trustedRoot = workspaceRoot ?? path.resolve('.');
    const runId = Date.now().toString(36);
    currentRunId = runId;

    pipelineEventBus.emit({ type: 'pipelineStart', runId, timestamp: Date.now(), totalSteps: pipeline.steps.length, name: pipeline.name, pipeline });

    try {
        let currentIndex = 0;
        const normalizedStartStepId = String(startStepId || '').trim();
        if (normalizedStartStepId) {
            const startIndex = pipeline.steps.findIndex((entry) => String(entry?.id || '').trim() === normalizedStartStepId);
            if (startIndex === -1) {
                throw new Error(`startStepId not found in pipeline: ${normalizedStartStepId}`);
            }
            currentIndex = startIndex;
        }
        const blockedStepIds = new Set<string>();
        const determinismByCapability = buildDeterminismMap();

        while (currentIndex < pipeline.steps.length) {
            while (isPaused && !isCancelled) await new Promise(r => setTimeout(r, 100));
            if (isCancelled) {
                runStatus = 'cancelled';
                break;
            }

            const step = pipeline.steps[currentIndex];
            const stepId = String(step?.id || '').trim();
            if (stepId && blockedStepIds.has(stepId)) { currentIndex++; continue; }
            const localIntentId = generateSecureToken(8);

            // SYSTEM.SETCWD
            if (step.intent === 'system.setCwd') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                const rawPath = (step.payload as any)?.path;
                if (rawPath) {
                    currentCwd = normalizeCwd(rawPath, currentCwd);
                }
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                currentIndex++; continue;
            }

            // SYSTEM.FORM
            if (step.intent === 'system.form') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                const fields = Array.isArray(step.payload?.fields) ? (step.payload.fields as any[]) : [];
                for (const raw of fields) {
                    const key = String(raw?.key || '').trim();
                    if (!key) {
                        continue;
                    }

                    const type = String(raw?.type || 'text').trim().toLowerCase();
                    const label = String(raw?.label || key).trim();
                    const required = !!raw?.required;
                    const defaultValue = String(raw?.default ?? '').trim();
                    let value: string | undefined;

                    if (type === 'select') {
                        const optionsRaw = Array.isArray(raw?.options)
                            ? raw.options
                            : String(raw?.options || '').split(',');
                        const options = optionsRaw
                            .map((entry: any) => String(entry ?? '').trim())
                            .filter(Boolean);

                        if (options.length > 0) {
                            const picked = await vscode.window.showQuickPick(options, {
                                placeHolder: label,
                                title: 'Leion Roots Form'
                            });
                            if (picked === undefined) {
                                isCancelled = true;
                                break;
                            }
                            value = picked;
                        } else {
                            value = await vscode.window.showInputBox({
                                prompt: label,
                                value: defaultValue || undefined
                            });
                        }
                    } else if (type === 'checkbox') {
                        const picked = await vscode.window.showQuickPick(['true', 'false'], {
                            placeHolder: label,
                            title: 'Leion Roots Form'
                        });
                        if (picked === undefined) {
                            isCancelled = true;
                            break;
                        }
                        value = picked;
                    } else {
                        value = await vscode.window.showInputBox({
                            prompt: label,
                            value: defaultValue || undefined
                        });
                    }

                    if (value === undefined) {
                        isCancelled = true;
                        break;
                    }

                    const normalized = String(value).trim();
                    if (required && !normalized) {
                        vscode.window.showErrorMessage(`Form field "${label}" is required.`);
                        isCancelled = true;
                        break;
                    }

                    variableCache.set(key, normalized || defaultValue);
                }
                if (isCancelled) {
                    runStatus = 'cancelled';
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: false, index: currentIndex, stepId: step.id });
                    break;
                }
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                currentIndex++; continue;
            }

            // SYSTEM.SWITCH
            if (step.intent === 'system.switch') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                const varKey = String(step.payload?.variableKey || '').trim();
                const currentValue = variableCache.get(varKey) || '';
                const routes = Array.isArray(step.payload?.routes) ? step.payload.routes : [];
                let targetStepId = step.payload?.defaultStepId;

                for (const r of routes) {
                    if (matchesSwitchRoute(currentValue, r)) {
                        targetStepId = r.targetStepId;
                        break;
                    }
                }

                if (targetStepId) {
                    const nextIdx = pipeline.steps.findIndex(s => s.id === targetStepId);
                    if (nextIdx !== -1) {
                        const allTargets = [...routes.map((r:any) => r.targetStepId), step.payload?.defaultStepId].filter(Boolean);
                        const toBlock = computeSwitchBlockedSteps(pipeline, targetStepId, allTargets);
                        toBlock.forEach(id => blockedStepIds.add(id));
                        pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                        currentIndex = nextIdx;
                        continue;
                    }
                }
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                currentIndex++; continue;
            }

            // SYSTEM.SETVAR
            if (step.intent === 'system.setVar') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                const variableName = String((step.payload as any)?.name || '').trim();
                if (variableName) {
                    const variableValue = (step.payload as any)?.value;
                    variableCache.set(variableName, String(variableValue ?? ''));
                }
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                currentIndex++;
                continue;
            }

            // SYSTEM.TRIGGER.*
            if (
                step.intent === 'system.trigger.cron' ||
                step.intent === 'system.trigger.webhook' ||
                step.intent === 'system.trigger.watch'
            ) {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                const triggerKind = step.intent.replace('system.trigger.', '');
                variableCache.set('trigger_step_id', String(step.id || ''));
                if (context?.source) {
                    variableCache.set('trigger_source', context.source);
                } else {
                    variableCache.set('trigger_source', 'manual');
                }
                variableCache.set('trigger_kind', triggerKind);
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                currentIndex++;
                continue;
            }

            // MEMORY.SAVE
            if (step.intent === 'memory.save') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                try {
                    const payload = resolveTemplateVariables(step.payload, variableCache);
                    if (!isRunMemoryEnabled()) {
                        pipelineEventBus.emit({
                            type: 'stepLog',
                            runId,
                            intentId: localIntentId,
                            stepId: step.id,
                            text: '[memory] disabled by intentRouter.memory.enabled=false',
                            stream: 'stderr'
                        } as any);
                        pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                        currentIndex++;
                        continue;
                    }

                    const sessionId = String(payload?.sessionId || 'default').trim() || 'default';
                    const key = String(payload?.key || '').trim() || String(step.id || 'entry');
                    const scopeRaw = String(payload?.scope || 'variables').trim().toLowerCase();
                    const scope = scopeRaw === 'full_run' || scopeRaw === 'run_segment' || scopeRaw === 'variables' || scopeRaw === 'raw'
                        ? scopeRaw
                        : 'variables';
                    const tags = parseCsvList(payload?.tags);
                    let data: any = {};

                    if (scope === 'full_run') {
                        data = {
                            variables: Object.fromEntries(variableCache.entries()),
                            stepResults: Array.from(stepResultCache.entries()).map(([stepId, entry]) => ({ stepId, ...entry }))
                        };
                    } else if (scope === 'run_segment') {
                        const stepIds = parseCsvList(payload?.stepIds);
                        const selected = stepIds.length > 0 ? stepIds : Array.from(stepResultCache.keys());
                        data = {
                            stepResults: selected
                                .filter((stepId) => stepResultCache.has(stepId))
                                .map((stepId) => ({ stepId, ...(stepResultCache.get(stepId) as any) })),
                            variables: pickVariableSubset(variableCache, parseCsvList(payload?.variableKeys))
                        };
                    } else if (scope === 'variables') {
                        const variableKeys = parseCsvList(payload?.variableKeys);
                        data = { variables: pickVariableSubset(variableCache, variableKeys) };
                    } else {
                        data = normalizeValueForMemory(payload?.data ?? payload?.value ?? '');
                    }

                    const saved = saveRunMemory({
                        sessionId,
                        key,
                        tags,
                        scope: scope as any,
                        runId,
                        stepId: String(step.id || '').trim() || undefined,
                        data
                    });

                    const outputVar = String(payload?.outputVar || '').trim();
                    if (outputVar) {
                        variableCache.set(outputVar, saved.id);
                    }
                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] saved entry ${saved.id} (${scope})`,
                        stream: 'stdout'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                    currentIndex++;
                    continue;
                } catch (error: any) {
                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] save failed: ${String(error?.message || error)}`,
                        stream: 'stderr'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: false, index: currentIndex, stepId: step.id });
                    if (step.onFailure) {
                        const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                        if (nextIdx !== -1) {
                            currentIndex = nextIdx;
                            continue;
                        }
                    }
                    runStatus = 'failure';
                    break;
                }
            }

            // MEMORY.RECALL
            if (step.intent === 'memory.recall') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                try {
                    const payload = resolveTemplateVariables(step.payload, variableCache);
                    if (!isRunMemoryEnabled()) {
                        pipelineEventBus.emit({
                            type: 'stepLog',
                            runId,
                            intentId: localIntentId,
                            stepId: step.id,
                            text: '[memory] disabled by intentRouter.memory.enabled=false',
                            stream: 'stderr'
                        } as any);
                        pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                        currentIndex++;
                        continue;
                    }

                    const sessionId = String(payload?.sessionId || '').trim();
                    const key = String(payload?.key || '').trim();
                    const tag = String(payload?.tag || '').trim();
                    const recallRunId = String(payload?.runId || '').trim();
                    const limit = toPositiveInt(payload?.limit, 5);
                    const mode = String(payload?.mode || 'latest').trim().toLowerCase() === 'all' ? 'all' : 'latest';
                    const records = queryRunMemory({
                        sessionId: sessionId || undefined,
                        key: key || undefined,
                        tag: tag || undefined,
                        runId: recallRunId || undefined,
                        limit: mode === 'all' ? Math.max(limit, 1) : 1,
                        newestFirst: true
                    });
                    const selected = mode === 'all' ? records : records.slice(0, 1);

                    const outputVar = String(payload?.outputVar || '').trim();
                    if (outputVar) {
                        variableCache.set(outputVar, JSON.stringify(mode === 'all' ? selected : (selected[0] || null)));
                    }
                    const outputVarCount = String(payload?.outputVarCount || '').trim();
                    if (outputVarCount) {
                        variableCache.set(outputVarCount, String(selected.length));
                    }

                    const injectVars = parseBoolean(payload?.injectVars, false);
                    const injectPrefix = String(payload?.injectPrefix || '').trim();
                    if (injectVars) {
                        for (const record of selected) {
                            const variableBag = record?.data?.variables;
                            if (!variableBag || typeof variableBag !== 'object') continue;
                            for (const [varName, value] of Object.entries(variableBag)) {
                                const targetKey = `${injectPrefix}${String(varName || '').trim()}`;
                                if (!targetKey.trim()) continue;
                                variableCache.set(targetKey, String(value ?? ''));
                            }
                        }
                    }

                    const requireMatch = parseBoolean(payload?.requireMatch, false);
                    if (requireMatch && selected.length === 0) {
                        throw new Error('No memory record matched the recall filters.');
                    }

                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] recalled ${selected.length} record(s)`,
                        stream: 'stdout'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                    currentIndex++;
                    continue;
                } catch (error: any) {
                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] recall failed: ${String(error?.message || error)}`,
                        stream: 'stderr'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: false, index: currentIndex, stepId: step.id });
                    if (step.onFailure) {
                        const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                        if (nextIdx !== -1) {
                            currentIndex = nextIdx;
                            continue;
                        }
                    }
                    runStatus = 'failure';
                    break;
                }
            }

            // MEMORY.CLEAR
            if (step.intent === 'memory.clear') {
                pipelineEventBus.emit({ type: 'stepStart', runId, intentId: localIntentId, timestamp: Date.now(), description: step.description, intent: step.intent, index: currentIndex, stepId: step.id });
                try {
                    const payload = resolveTemplateVariables(step.payload, variableCache);
                    if (!isRunMemoryEnabled()) {
                        pipelineEventBus.emit({
                            type: 'stepLog',
                            runId,
                            intentId: localIntentId,
                            stepId: step.id,
                            text: '[memory] disabled by intentRouter.memory.enabled=false',
                            stream: 'stderr'
                        } as any);
                        pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                        currentIndex++;
                        continue;
                    }

                    const removed = clearRunMemory({
                        sessionId: String(payload?.sessionId || '').trim() || undefined,
                        key: String(payload?.key || '').trim() || undefined,
                        tag: String(payload?.tag || '').trim() || undefined,
                        runId: String(payload?.runId || '').trim() || undefined,
                        keepLast: Number(payload?.keepLast || 0)
                    });
                    const outputVarRemoved = String(payload?.outputVarRemoved || '').trim();
                    const outputVarRemaining = String(payload?.outputVarRemaining || '').trim();
                    if (outputVarRemoved) variableCache.set(outputVarRemoved, String(removed.removed));
                    if (outputVarRemaining) variableCache.set(outputVarRemaining, String(removed.remaining));

                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] cleared ${removed.removed} record(s), remaining ${removed.remaining}`,
                        stream: 'stdout'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: true, index: currentIndex, stepId: step.id });
                    currentIndex++;
                    continue;
                } catch (error: any) {
                    pipelineEventBus.emit({
                        type: 'stepLog',
                        runId,
                        intentId: localIntentId,
                        stepId: step.id,
                        text: `[memory] clear failed: ${String(error?.message || error)}`,
                        stream: 'stderr'
                    } as any);
                    pipelineEventBus.emit({ type: 'stepEnd', runId, intentId: localIntentId, timestamp: Date.now(), success: false, index: currentIndex, stepId: step.id });
                    if (step.onFailure) {
                        const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                        if (nextIdx !== -1) {
                            currentIndex = nextIdx;
                            continue;
                        }
                    }
                    runStatus = 'failure';
                    break;
                }
            }

            // COMPILE AND EXECUTE
            const compiledStep = await compileStep(step, variableCache, currentCwd, trustedRoot);
            const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);
            pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: compiledStep.description, intent: compiledStep.intent, index: currentIndex, stepId: compiledStep.id });

            compiledStep.meta = { ...(compiledStep.meta || {}), traceId: intentId, runId, stepId: compiledStep.id };
            const sandboxPolicy = resolveRuntimeSandboxPolicy(compiledStep);
            const sandboxError = checkRuntimeSandbox(compiledStep, sandboxPolicy, sandboxUsage);
            if (sandboxError) {
                pipelineEventBus.emit({
                    type: 'stepLog',
                    runId,
                    intentId,
                    stepId: compiledStep.id,
                    text: `[sandbox] ${sandboxError}`,
                    stream: 'stderr'
                } as any);
                pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: false, index: currentIndex, stepId: compiledStep.id });
                if (step.onFailure) {
                    const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                    if (nextIdx !== -1) {
                        currentIndex = nextIdx;
                        continue;
                    }
                }
                runStatus = 'failure';
                break;
            }

            if (detectIntentUsesNetwork(compiledStep)) sandboxUsage.networkOps += 1;
            if (detectIntentWritesFiles(compiledStep)) sandboxUsage.fileWrites += 1;

            const timedResult = await Promise.race([
                routeIntent(compiledStep, variableCache),
                new Promise<any>((_, reject) => {
                    const handle = setTimeout(() => {
                        clearTimeout(handle);
                        reject(new Error(`Step timed out after ${sandboxPolicy.timeoutMs}ms.`));
                    }, sandboxPolicy.timeoutMs);
                })
            ]).catch((error) => {
                pipelineEventBus.emit({
                    type: 'stepLog',
                    runId,
                    intentId,
                    stepId: compiledStep.id,
                    text: `[sandbox] ${String(error?.message || error)}`,
                    stream: 'stderr'
                } as any);
                return false;
            });
            const result = timedResult;
            const ok = typeof result === 'boolean' ? result : (result !== undefined && result !== null);

            // VARIABLE CAPTURE (Multi-value support)
            if (ok && result && typeof result === 'object') {
                const outContent = compiledStep.payload?.outputVar;
                const outPath = compiledStep.payload?.outputVarPath;
                const outChanges = compiledStep.payload?.outputVarChanges;
                if (outContent && result.content !== undefined) variableCache.set(outContent, String(result.content));
                if (outPath && result.path !== undefined) variableCache.set(outPath, String(result.path));
                if (outChanges && result.changes !== undefined) variableCache.set(outChanges, JSON.stringify(result.changes));
            } else if (ok) {
                const outVar = compiledStep.payload?.outputVar;
                if (outVar) variableCache.set(outVar, String(result));
            }
            if (compiledStep.id) {
                stepResultCache.set(String(compiledStep.id), {
                    intent: String(compiledStep.intent || ''),
                    success: ok,
                    timestamp: Date.now(),
                    output: normalizeValueForMemory(result)
                });
            }

            pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: ok, index: currentIndex, stepId: compiledStep.id });
            
            if (ok) {
                currentIndex++;
            } else {
                if (step.onFailure) {
                    const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                    if (nextIdx !== -1) { currentIndex = nextIdx; continue; }
                }
                runStatus = 'failure';
                break;
            }
        }
        if (isCancelled && runStatus !== 'failure') {
            runStatus = 'cancelled';
        }
        pipelineEventBus.emit({
            type: 'pipelineEnd',
            runId,
            timestamp: Date.now(),
            success: runStatus === 'success',
            status: runStatus
        });
        return { runId, success: runStatus === 'success', status: runStatus };
    } catch (e) {
        runStatus = 'failure';
        pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: false, status: 'failure' });
        return { runId, success: false, status: 'failure' };
    } finally {
        currentRunId = null;
    }
}

function normalizeCwd(rawCwd: any, fallbackCwd: string): string {
    const v = typeof rawCwd === 'string' ? rawCwd.trim() : '';
    if (!v || v === '.' || v === '${workspaceRoot}') {
        return fallbackCwd;
    }
    if (v.startsWith('${workspaceRoot}')) {
        const suffix = v.slice('${workspaceRoot}'.length).trim().replace(/^[/\\]+/, '');
        return suffix ? path.resolve(fallbackCwd, suffix) : fallbackCwd;
    }
    if (path.isAbsolute(v)) {
        return v;
    }
    return path.resolve(fallbackCwd, v);
}

function applyDefaultCwd(payload: any, cwd: string): any {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return payload;
    }
    return { ...payload, cwd: normalizeCwd(payload?.cwd, cwd) };
}

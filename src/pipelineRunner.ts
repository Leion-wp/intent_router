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

// Global registry for pending decisions
export function resolveDecision(nodeId: string, decision: 'approve' | 'reject') {
    pipelineEventBus.emit({
        type: 'pipelineDecision',
        nodeId,
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

export async function runPipelineFromActiveEditor(dryRun: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const pipeline = parsePipeline(editor.document.getText());
    if (!pipeline) return;
    await runPipelineFromData(pipeline, dryRun);
}

export async function runPipelineFromUri(uri: vscode.Uri, dryRun: boolean): Promise<void> {
    const pipeline = await readPipelineFromUri(uri);
    if (!pipeline) return;
    await runPipelineFromData(pipeline, dryRun);
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

export async function runPipelineFromData(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    await runPipeline(pipeline, dryRun);
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

async function runPipeline(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    isCancelled = false;
    isPaused = false;
    const variableCache = new Map<string, string>();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    let currentCwd = resolveInitialCwd();
    const trustedRoot = workspaceRoot ?? path.resolve('.');
    const runId = Date.now().toString(36);
    currentRunId = runId;

    pipelineEventBus.emit({ type: 'pipelineStart', runId, timestamp: Date.now(), totalSteps: pipeline.steps.length, name: pipeline.name, pipeline });

    try {
        let currentIndex = 0;
        const blockedStepIds = new Set<string>();
        const determinismByCapability = buildDeterminismMap();

        while (currentIndex < pipeline.steps.length) {
            while (isPaused && !isCancelled) await new Promise(r => setTimeout(r, 100));
            if (isCancelled) break;

            const step = pipeline.steps[currentIndex];
            const stepId = String(step?.id || '').trim();
            if (stepId && blockedStepIds.has(stepId)) { currentIndex++; continue; }

            // SYSTEM.SETCWD
            if (step.intent === 'system.setCwd') {
                const rawPath = (step.payload as any)?.path;
                if (rawPath) {
                    currentCwd = normalizeCwd(rawPath, currentCwd);
                }
                currentIndex++; continue;
            }

            // SYSTEM.FORM
            if (step.intent === 'system.form') {
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
                if (isCancelled) break;
                currentIndex++; continue;
            }

            // SYSTEM.SWITCH
            if (step.intent === 'system.switch') {
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
                        currentIndex = nextIdx;
                        continue;
                    }
                }
                currentIndex++; continue;
            }

            // COMPILE AND EXECUTE
            const compiledStep = await compileStep(step, variableCache, currentCwd, trustedRoot);
            const intentId = compiledStep.meta?.traceId ?? generateSecureToken(8);
            pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: compiledStep.description, index: currentIndex, stepId: compiledStep.id });

            compiledStep.meta = { ...(compiledStep.meta || {}), traceId: intentId, runId, stepId: compiledStep.id };

            const result = await routeIntent(compiledStep, variableCache);
            const ok = typeof result === 'boolean' ? result : (result !== undefined && result !== null);

            // VARIABLE CAPTURE (Multi-value support)
            if (ok && result && typeof result === 'object') {
                const outContent = compiledStep.payload?.outputVar;
                const outPath = compiledStep.payload?.outputVarPath;
                if (outContent && result.content !== undefined) variableCache.set(outContent, String(result.content));
                if (outPath && result.path !== undefined) variableCache.set(outPath, String(result.path));
            } else if (ok) {
                const outVar = compiledStep.payload?.outputVar;
                if (outVar) variableCache.set(outVar, String(result));
            }

            pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: ok, index: currentIndex, stepId: compiledStep.id });
            
            if (ok) {
                currentIndex++;
            } else {
                if (step.onFailure) {
                    const nextIdx = pipeline.steps.findIndex(s => s.id === step.onFailure);
                    if (nextIdx !== -1) { currentIndex = nextIdx; continue; }
                }
                break;
            }
        }
        pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: !isCancelled, status: isCancelled ? 'cancelled' : 'success' });
    } catch (e) {
        pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: false, status: 'failure' });
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

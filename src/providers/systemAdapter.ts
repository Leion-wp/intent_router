import * as vscode from 'vscode';
import * as path from 'path';
import { registerCapabilities } from '../registry';
import { cancelCurrentPipeline, readPipelineFromUri, runPipelineFromData } from '../pipelineRunner';
import { pipelineEventBus } from '../eventBus';

export function registerSystemProvider(context: vscode.ExtensionContext) {
    doRegister();

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemPause', async (args: any) => {
            await executeSystemCommand(args);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSetVar', async (_args: any) => {
            // Handled in the PipelineRunner (variable cache). Kept for direct invocation compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSetCwd', async (_args: any) => {
            // Handled in the PipelineRunner (current cwd). Kept for direct invocation compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemForm', async (_args: any) => {
            // Handled in the PipelineRunner (HITL form -> variable cache). Kept for determinism/policy + compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSwitch', async (_args: any) => {
            // Handled in the PipelineRunner (routing). Kept for determinism/policy + compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSubPipeline', async (args: any) => {
            return await executeSystemSubPipeline(args);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemLoop', async (args: any) => {
            return await executeSystemLoop(args);
        })
    );
}

function doRegister() {
    registerCapabilities({
        provider: 'system',
        type: 'vscode',
        capabilities: [
            {
                capability: 'system.pause',
                command: 'intentRouter.internal.systemPause',
                description: 'Pause execution for human verification',
                determinism: 'interactive',
                args: [
                    { name: 'message', type: 'string', description: 'Message to display in the modal', required: true, default: 'Pipeline paused for review.' }
                ]
            },
            {
                capability: 'system.setVar',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Set a pipeline variable for later steps',
                determinism: 'deterministic',
                args: [
                    { name: 'name', type: 'string', description: 'Variable name (used by ${input:Name} / ${var:Name})', required: true },
                    { name: 'value', type: 'string', description: 'Variable value', required: true }
                ]
            },
            {
                capability: 'system.setCwd',
                command: 'intentRouter.internal.systemSetCwd',
                description: 'Set the working directory for subsequent steps',
                determinism: 'deterministic',
                args: [
                    { name: 'path', type: 'path', description: 'Working directory path', required: true }
                ]
            },
            {
                capability: 'system.form',
                command: 'intentRouter.internal.systemForm',
                description: 'Collect human inputs and store them as variables',
                determinism: 'interactive',
                args: [
                    { name: 'fields', type: 'string', description: 'JSON array of fields (handled by runner)', required: false }
                ]
            },
            {
                capability: 'system.switch',
                command: 'intentRouter.internal.systemSwitch',
                description: 'Route to a branch based on a variable value (equals match + default)',
                determinism: 'deterministic',
                args: [
                    { name: 'variableKey', type: 'string', description: 'Variable key to read', required: true },
                    { name: 'routes', type: 'string', description: 'JSON routes (handled by runner)', required: false },
                    { name: 'defaultStepId', type: 'string', description: 'Default target step id', required: true }
                ]
            },
            {
                capability: 'system.subPipeline',
                command: 'intentRouter.internal.systemSubPipeline',
                description: 'Run another pipeline file as a nested sub-run',
                determinism: 'deterministic',
                args: [
                    { name: 'pipelinePath', type: 'path', description: 'Child pipeline path (.intent.json)', required: true },
                    { name: 'dryRunChild', type: 'boolean', description: 'Run child in dry-run mode', required: false, default: false },
                    { name: 'inputJson', type: 'string', description: 'Optional input JSON object for child runtime variables', required: false },
                    { name: 'outputVar', type: 'string', description: 'Optional output variable name (handled by runner capture)', required: false }
                ]
            },
            {
                capability: 'system.loop',
                command: 'intentRouter.internal.systemLoop',
                description: 'Iterate over items and run a child pipeline for each item',
                determinism: 'deterministic',
                args: [
                    { name: 'executionMode', type: 'enum', options: ['child_pipeline', 'graph_segment'], description: 'Loop execution mode', required: false, default: 'child_pipeline' },
                    { name: 'items', type: 'string', description: 'Items source: CSV, JSON array, or template-resolved value', required: true },
                    { name: 'pipelinePath', type: 'path', description: 'Child pipeline path (.intent.json)', required: true },
                    { name: 'itemVar', type: 'string', description: 'Runtime var receiving current item', required: false, default: 'loop_item' },
                    { name: 'indexVar', type: 'string', description: 'Runtime var receiving current index', required: false, default: 'loop_index' },
                    { name: 'maxIterations', type: 'string', description: 'Safety limit for iterations', required: false, default: '20' },
                    { name: 'repeatCount', type: 'string', description: 'Number of passes over full items list', required: false, default: '1' },
                    { name: 'dryRunChild', type: 'boolean', description: 'Run child in dry-run mode', required: false, default: false },
                    { name: 'continueOnChildError', type: 'boolean', description: 'Continue loop when child run fails', required: false, default: false },
                    { name: 'errorStrategy', type: 'enum', options: ['fail_fast', 'fail_at_end', 'threshold'], description: 'Failure strategy for loop body', required: false, default: 'fail_fast' },
                    { name: 'errorThreshold', type: 'string', description: 'Allowed failures when strategy=threshold', required: false, default: '1' },
                    { name: 'inputJson', type: 'string', description: 'Optional base runtime variables JSON object', required: false },
                    { name: 'graphStepIds', type: 'string', description: 'Graph-segment source step ids (runtime-managed)', required: false },
                    { name: 'doneStepId', type: 'string', description: 'Graph-segment done target step id (runtime-managed)', required: false },
                    { name: 'outputVar', type: 'string', description: 'Optional output variable name (handled by runner capture)', required: false }
                ]
            },
            {
                capability: 'system.trigger.cron',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline on interval/cron schedule',
                determinism: 'deterministic',
                args: [
                    { name: 'cron', type: 'string', description: 'Cron expression (supports */N minutes or 0 */N hours patterns)', required: false },
                    { name: 'intervalMs', type: 'string', description: 'Interval in milliseconds', required: false },
                    { name: 'everyMinutes', type: 'string', description: 'Interval in minutes', required: false },
                    { name: 'everyHours', type: 'string', description: 'Interval in hours', required: false },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'system.trigger.webhook',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline from HTTP webhook',
                determinism: 'interactive',
                args: [
                    { name: 'path', type: 'string', description: 'Webhook path (ex: /factory/idea)', required: true },
                    { name: 'method', type: 'string', description: 'HTTP method', required: false, default: 'POST' },
                    { name: 'secret', type: 'string', description: 'Optional shared secret (x-leion-secret header)', required: false },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'system.trigger.watch',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline when files change',
                determinism: 'deterministic',
                args: [
                    { name: 'glob', type: 'string', description: 'Workspace glob pattern (ex: **/*.md)', required: true },
                    { name: 'events', type: 'string', description: 'CSV events: create,change,delete', required: false, default: 'change' },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'debounceMs', type: 'string', description: 'Debounce delay for burst changes', required: false },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'memory.save',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Save run memory entry (full run, segment, variables, or raw data)',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Memory session id', required: true, default: 'default' },
                    { name: 'key', type: 'string', description: 'Memory key (logical bucket)', required: false, default: 'entry' },
                    { name: 'scope', type: 'enum', options: ['full_run', 'run_segment', 'variables', 'raw'], description: 'What to save', required: false, default: 'variables' },
                    { name: 'variableKeys', type: 'string', description: 'CSV variable keys (used by scope=variables)', required: false },
                    { name: 'stepIds', type: 'string', description: 'CSV step ids (used by scope=run_segment)', required: false },
                    { name: 'data', type: 'string', description: 'Raw data payload (used by scope=raw)', required: false },
                    { name: 'tags', type: 'string', description: 'CSV tags', required: false },
                    { name: 'outputVar', type: 'string', description: 'Variable name receiving memory entry id', required: false }
                ]
            },
            {
                capability: 'memory.recall',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Recall memory entries into variables',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Memory session id', required: true, default: 'default' },
                    { name: 'key', type: 'string', description: 'Optional memory key filter', required: false },
                    { name: 'tag', type: 'string', description: 'Optional tag filter', required: false },
                    { name: 'runId', type: 'string', description: 'Optional run id filter', required: false },
                    { name: 'limit', type: 'string', description: 'Max records', required: false, default: '5' },
                    { name: 'mode', type: 'enum', options: ['latest', 'all'], description: 'Recall mode', required: false, default: 'latest' },
                    { name: 'outputVar', type: 'string', description: 'Variable name for recalled JSON', required: false, default: 'memory_recall' },
                    { name: 'outputVarCount', type: 'string', description: 'Variable name for recalled record count', required: false },
                    { name: 'injectVars', type: 'boolean', description: 'Inject recalled variables into runtime cache', required: false, default: false },
                    { name: 'injectPrefix', type: 'string', description: 'Prefix for injected variables', required: false, default: '' },
                    { name: 'requireMatch', type: 'boolean', description: 'Fail step if recall result is empty', required: false, default: false }
                ]
            },
            {
                capability: 'memory.clear',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Clear memory entries by filter',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Optional memory session id', required: false },
                    { name: 'key', type: 'string', description: 'Optional memory key', required: false },
                    { name: 'tag', type: 'string', description: 'Optional tag', required: false },
                    { name: 'runId', type: 'string', description: 'Optional run id', required: false },
                    { name: 'keepLast', type: 'string', description: 'Keep N newest matching entries', required: false, default: '0' },
                    { name: 'outputVarRemoved', type: 'string', description: 'Variable name receiving removed count', required: false },
                    { name: 'outputVarRemaining', type: 'string', description: 'Variable name receiving remaining count', required: false }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered System provider capabilities.');
}

export async function executeSystemCommand(args: any): Promise<void> {
    const message = args?.message || 'Pipeline paused for human review.';

    const selection = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Continue',
        'Cancel'
    );

    if (selection !== 'Continue') {
        cancelCurrentPipeline();
        throw new Error('Pipeline aborted by user.');
    }
}

function parseInputVars(args: any): Record<string, string> {
    if (args?.input && typeof args.input === 'object' && !Array.isArray(args.input)) {
        return Object.fromEntries(
            Object.entries(args.input).map(([key, value]) => [String(key), String(value ?? '')])
        );
    }
    const rawInputJson = String(args?.inputJson || '').trim();
    if (!rawInputJson) return {};
    let parsed: any = {};
    try {
        parsed = JSON.parse(rawInputJson);
    } catch (error: any) {
        throw new Error(`Sub-pipeline inputJson is invalid JSON: ${String(error?.message || error)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Sub-pipeline inputJson must be a JSON object.');
    }
    return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [String(key), String(value ?? '')])
    );
}

async function executeSystemSubPipeline(args: any): Promise<any> {
    const { childPipeline, rawPipelinePath, depth } = await resolveChildPipeline(args, 'Sub-pipeline');
    const runtimeVariables = parseInputVars(args);
    const dryRunParent = args?.__meta?.dryRun === true;
    const dryRunChild = args?.dryRunChild === true || dryRunParent;
    const childResult = await runPipelineFromData(
        childPipeline,
        dryRunChild,
        undefined,
        {
            source: 'manual',
            runtimeVariables,
            subPipelineDepth: depth
        } as any
    );

    const payload = {
        childStatus: childResult.status,
        childSuccess: childResult.success,
        childRunId: childResult.runId,
        childPipelinePath: rawPipelinePath,
        depth
    };

    return {
        content: JSON.stringify(payload),
        path: rawPipelinePath,
        changes: []
    };
}

function parseLoopItems(raw: any): string[] {
    if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry ?? '')).filter((entry) => entry.length > 0);
    }
    const value = String(raw ?? '').trim();
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.map((entry) => String(entry ?? '')).filter((entry) => entry.length > 0);
        }
    } catch {
        // fall through to csv parsing
    }
    if (value.includes('\n')) {
        return value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    }
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

async function executeSystemLoop(args: any): Promise<any> {
    const executionMode = String(args?.executionMode || 'child_pipeline').trim().toLowerCase();
    if (executionMode === 'graph_segment') {
        throw new Error('system.loop graph_segment mode is handled by pipeline runner.');
    }
    const { childPipeline, rawPipelinePath, depth } = await resolveChildPipeline(args, 'Loop');
    const baseVars = parseInputVars(args);
    const items = parseLoopItems(args?.items);
    if (!items.length) {
        throw new Error('Loop requires non-empty "items".');
    }
    const maxIterationsRaw = Number(args?.maxIterations || 20);
    const maxCycles = Number.isFinite(maxIterationsRaw) ? Math.max(1, Math.floor(maxIterationsRaw)) : 20;
    const maxItemExecutions = Math.max(1, items.length) * maxCycles;
    const repeatCountRaw = Number(args?.repeatCount || 1);
    const repeatCount = Number.isFinite(repeatCountRaw) ? Math.max(1, Math.floor(repeatCountRaw)) : 1;
    const continueOnChildError = args?.continueOnChildError === true;
    const errorStrategyRaw = String(args?.errorStrategy || '').trim().toLowerCase();
    const errorStrategy = errorStrategyRaw === 'fail_at_end' || errorStrategyRaw === 'threshold'
        ? errorStrategyRaw
        : (continueOnChildError ? 'fail_at_end' : 'fail_fast');
    const errorThresholdRaw = Number(args?.errorThreshold ?? 1);
    const errorThreshold = Number.isFinite(errorThresholdRaw) ? Math.max(1, Math.floor(errorThresholdRaw)) : 1;
    const itemVar = String(args?.itemVar || 'loop_item').trim() || 'loop_item';
    const indexVar = String(args?.indexVar || 'loop_index').trim() || 'loop_index';
    const dryRunParent = args?.__meta?.dryRun === true;
    const dryRunChild = args?.dryRunChild === true || dryRunParent;
    const loopEnabled = vscode.workspace.getConfiguration('intentRouter').get<boolean>('runtime.loop.enabled', true);
    if (!loopEnabled) {
        throw new Error('Loop execution disabled by runtime.loop.enabled=false');
    }
    const maxTotalOpsCfgRaw = Number(vscode.workspace.getConfiguration('intentRouter').get<number>('runtime.loop.maxTotalOps', 500));
    const maxTotalOpsCfg = Number.isFinite(maxTotalOpsCfgRaw) ? Math.max(1, Math.floor(maxTotalOpsCfgRaw)) : 500;
    const maxDurationCfgRaw = Number(vscode.workspace.getConfiguration('intentRouter').get<number>('runtime.loop.maxDurationMs', 900000));
    const maxDurationCfg = Number.isFinite(maxDurationCfgRaw) ? Math.max(1000, Math.floor(maxDurationCfgRaw)) : 900000;
    const loopStartTs = Date.now();
    const runId = String(args?.__meta?.runId || '').trim();
    const intentId = String(args?.__meta?.traceId || '').trim();
    const stepId = String(args?.__meta?.stepId || '').trim();
    const emitLoopLog = (text: string, stream: 'stdout' | 'stderr' = 'stdout') => {
        if (!runId || !intentId) return;
        pipelineEventBus.emit({ type: 'stepLog', runId, intentId, stepId: stepId || undefined, text, stream } as any);
    };

    let successCount = 0;
    let failureCount = 0;
    let lastRunId = '';
    let processedItems = 0;
    let truncated = false;

    for (let cycleIndex = 0; cycleIndex < repeatCount; cycleIndex += 1) {
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            if ((Date.now() - loopStartTs) > maxDurationCfg) {
                throw new Error(`Loop maxDurationMs exceeded (${maxDurationCfg}).`);
            }
            if (processedItems >= maxItemExecutions) {
                truncated = true;
                break;
            }
            if ((processedItems + 1) > maxTotalOpsCfg) {
                throw new Error(`Loop maxTotalOps exceeded (${maxTotalOpsCfg}).`);
            }
            const globalIndex = processedItems;
            emitLoopLog(`[loop] iter=${globalIndex + 1} cycle=${cycleIndex + 1} item="${String(items[itemIndex])}" child=${rawPipelinePath}`);
            const loopVars: Record<string, string> = {
                ...baseVars,
                [itemVar]: String(items[itemIndex]),
                [indexVar]: String(globalIndex),
                loop_cycle: String(cycleIndex)
            };
            const childResult = await runPipelineFromData(
                childPipeline,
                dryRunChild,
                undefined,
                {
                    source: 'manual',
                    runtimeVariables: loopVars,
                    subPipelineDepth: depth
                } as any
            );
            processedItems += 1;
            lastRunId = childResult.runId;
            if (childResult.success) {
                successCount += 1;
                continue;
            }
            failureCount += 1;
            const abortNow = errorStrategy === 'fail_fast'
                || (errorStrategy === 'threshold' && failureCount > errorThreshold);
            if (abortNow) {
                throw new Error(`Loop child failed at index ${globalIndex} (item="${String(items[itemIndex])}")`);
            }
        }
        if (truncated) break;
    }
    if (errorStrategy === 'fail_at_end' && failureCount > 0) {
        throw new Error(`Loop completed with ${failureCount} failure(s) under fail_at_end strategy.`);
    }
    emitLoopLog(`[loop] summary processed=${processedItems} success=${successCount} failure=${failureCount} truncated=${truncated}`);

    const payload = {
        childPipelinePath: rawPipelinePath,
        totalItems: items.length,
        repeatCount,
        processedItems,
        truncated,
        successCount,
        failureCount,
        maxCycles,
        maxItemExecutions,
        errorStrategy,
        errorThreshold,
        maxTotalOps: maxTotalOpsCfg,
        maxDurationMs: maxDurationCfg,
        depth,
        lastRunId
    };

    return {
        content: JSON.stringify(payload),
        path: rawPipelinePath,
        changes: []
    };
}

async function resolveChildPipeline(args: any, operationLabel: string): Promise<{ childPipeline: any; rawPipelinePath: string; depth: number }> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        throw new Error(`${operationLabel} execution requires an opened workspace.`);
    }
    const rawPipelinePath = String(args?.pipelinePath || '').trim();
    if (!rawPipelinePath) {
        throw new Error(`${operationLabel} requires "pipelinePath".`);
    }
    const currentCwd = String(args?.__meta?.cwd || workspaceRoot).trim() || workspaceRoot;
    const candidate = path.isAbsolute(rawPipelinePath)
        ? path.normalize(rawPipelinePath)
        : path.resolve(currentCwd, rawPipelinePath);
    const trustedWorkspace = path.resolve(workspaceRoot);
    const trustedPrefix = trustedWorkspace.endsWith(path.sep) ? trustedWorkspace : `${trustedWorkspace}${path.sep}`;
    const normalizedCandidate = path.resolve(candidate);
    if (normalizedCandidate !== trustedWorkspace && !normalizedCandidate.startsWith(trustedPrefix)) {
        throw new Error(`${operationLabel} path must stay inside workspace: ${rawPipelinePath}`);
    }

    const currentDepthRaw = Number(args?.__meta?.subPipelineDepth || 0);
    const currentDepth = Number.isFinite(currentDepthRaw) ? Math.max(0, Math.floor(currentDepthRaw)) : 0;
    const maxDepthRaw = vscode.workspace.getConfiguration('intentRouter').get<number>('runtime.subPipeline.maxDepth', 4);
    const maxDepth = Number.isFinite(Number(maxDepthRaw)) ? Math.max(1, Math.floor(Number(maxDepthRaw))) : 4;
    if (currentDepth >= maxDepth) {
        throw new Error(`${operationLabel} max depth reached (${maxDepth}).`);
    }

    const uri = vscode.Uri.file(normalizedCandidate);
    const childPipeline = await readPipelineFromUri(uri);
    if (!childPipeline) {
        throw new Error(`Unable to read child pipeline: ${rawPipelinePath}`);
    }
    return { childPipeline, rawPipelinePath, depth: currentDepth + 1 };
}

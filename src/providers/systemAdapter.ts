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
        vscode.commands.registerCommand('intentRouter.internal.systemPolicyCheck', async (args: any) => {
            return await executeSystemPolicyCheck(args);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemBudgetGuard', async (args: any) => {
            return await executeSystemBudgetGuard(args);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemRateLimit', async (args: any) => {
            return await executeSystemRateLimit(args);
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
                capability: 'system.policy.check',
                command: 'intentRouter.internal.systemPolicyCheck',
                description: 'Evaluate a value against declarative policy rules',
                determinism: 'deterministic',
                args: [
                    { name: 'subject', type: 'string', description: 'String or JSON payload to evaluate', required: true },
                    { name: 'rules', type: 'string', description: 'JSON array of policy rules', required: true },
                    { name: 'mode', type: 'enum', options: ['warn', 'block'], description: 'Warn only or fail on violation', required: false, default: 'block' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the summary payload', required: false },
                    { name: 'outputVarData', type: 'string', description: 'Variable to store the detailed data payload', required: false }
                ]
            },
            {
                capability: 'system.budget.guard',
                command: 'intentRouter.internal.systemBudgetGuard',
                description: 'Check a numeric budget threshold and optionally block when exceeded',
                determinism: 'deterministic',
                args: [
                    { name: 'value', type: 'string', description: 'Current spend/usage value', required: true },
                    { name: 'limit', type: 'string', description: 'Maximum allowed value', required: true },
                    { name: 'label', type: 'string', description: 'Optional budget label', required: false },
                    { name: 'unit', type: 'string', description: 'Optional unit/currency', required: false },
                    { name: 'warnAtPct', type: 'string', description: 'Optional warning threshold percentage', required: false, default: '80' },
                    { name: 'mode', type: 'enum', options: ['warn', 'block'], description: 'Warn only or fail on limit breach', required: false, default: 'block' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the summary payload', required: false },
                    { name: 'outputVarData', type: 'string', description: 'Variable to store the detailed data payload', required: false }
                ]
            },
            {
                capability: 'system.rateLimit',
                command: 'intentRouter.internal.systemRateLimit',
                description: 'Throttle repeated actions by key within a time window',
                determinism: 'deterministic',
                args: [
                    { name: 'key', type: 'string', description: 'Rate-limit bucket key', required: true },
                    { name: 'limit', type: 'string', description: 'Maximum hits allowed in the window', required: true },
                    { name: 'windowMs', type: 'string', description: 'Window size in milliseconds', required: true },
                    { name: 'scope', type: 'string', description: 'Optional namespace for the bucket key', required: false, default: 'global' },
                    { name: 'consume', type: 'boolean', description: 'Whether to record the current hit', required: false, default: true },
                    { name: 'mode', type: 'enum', options: ['warn', 'block'], description: 'Warn only or fail when limit is exceeded', required: false, default: 'block' },
                    { name: 'nowMs', type: 'string', description: 'Optional fixed timestamp for deterministic tests', required: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the summary payload', required: false },
                    { name: 'outputVarData', type: 'string', description: 'Variable to store the detailed data payload', required: false }
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

type PolicyRule = {
    kind?: string;
    path?: string;
    value?: any;
    values?: any[];
    pattern?: string;
    flags?: string;
    message?: string;
};

type PolicyViolation = {
    ruleIndex: number;
    kind: string;
    path?: string;
    message: string;
    expected?: any;
    actual?: any;
};

type BudgetGuardArgs = {
    value?: string | number;
    limit?: string | number;
    label?: string;
    unit?: string;
    warnAtPct?: string | number;
    mode?: string;
    __meta?: any;
};

type RateLimitArgs = {
    key?: string;
    limit?: string | number;
    windowMs?: string | number;
    scope?: string;
    consume?: boolean;
    mode?: string;
    nowMs?: string | number;
    __meta?: any;
};

const rateLimitBuckets = new Map<string, number[]>();

function emitPolicyLog(meta: any, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
    const runId = String(meta?.runId || '').trim();
    const intentId = String(meta?.traceId || '').trim();
    if (!runId || !intentId) {
        return;
    }
    pipelineEventBus.emit({
        type: 'stepLog',
        runId,
        intentId,
        stepId: meta?.stepId,
        text: text.endsWith('\n') ? text : `${text}\n`,
        stream
    });
}

function parsePolicyRules(raw: any): PolicyRule[] {
    if (Array.isArray(raw)) {
        return raw as PolicyRule[];
    }
    const text = String(raw ?? '').trim();
    if (!text) {
        throw new Error('system.policy.check requires non-empty "rules".');
    }
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch (error: any) {
        throw new Error(`system.policy.check rules must be valid JSON: ${String(error?.message || error)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error('system.policy.check rules must be a JSON array.');
    }
    return parsed as PolicyRule[];
}

function parsePolicySubject(raw: any): any {
    if (raw === undefined || raw === null) {
        return '';
    }
    if (typeof raw !== 'string') {
        return raw;
    }
    const text = raw.trim();
    if (!text) {
        return '';
    }
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
        try {
            return JSON.parse(text);
        } catch {
            return raw;
        }
    }
    return raw;
}

function readPolicyPath(subject: any, rawPath: string | undefined): any {
    const pathValue = String(rawPath || '').trim();
    if (!pathValue) {
        return subject;
    }
    const segments = pathValue.split('.').map((segment) => segment.trim()).filter(Boolean);
    let current = subject;
    for (const segment of segments) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (Array.isArray(current) && /^\d+$/.test(segment)) {
            current = current[Number(segment)];
            continue;
        }
        if (typeof current === 'object' && segment in current) {
            current = current[segment];
            continue;
        }
        return undefined;
    }
    return current;
}

function stringifyComparable(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function policyLength(value: any): number | undefined {
    if (typeof value === 'string' || Array.isArray(value)) {
        return value.length;
    }
    if (value && typeof value === 'object') {
        return Object.keys(value).length;
    }
    return undefined;
}

function includesValue(actual: any, expected: any): boolean {
    if (typeof actual === 'string') {
        return actual.includes(String(expected ?? ''));
    }
    if (Array.isArray(actual)) {
        return actual.some((entry) => stringifyComparable(entry) === stringifyComparable(expected));
    }
    return false;
}

function ruleViolation(rule: PolicyRule, ruleIndex: number, actual: any, fallbackMessage: string): PolicyViolation {
    return {
        ruleIndex,
        kind: String(rule.kind || 'unknown').trim() || 'unknown',
        path: String(rule.path || '').trim() || undefined,
        message: String(rule.message || '').trim() || fallbackMessage,
        expected: rule.value ?? rule.values ?? rule.pattern,
        actual
    };
}

function evaluatePolicyRule(subject: any, rule: PolicyRule, ruleIndex: number): PolicyViolation | null {
    const kind = String(rule.kind || '').trim().toLowerCase();
    if (!kind) {
        return ruleViolation(rule, ruleIndex, undefined, 'Policy rule is missing "kind".');
    }
    const actual = readPolicyPath(subject, rule.path);
    switch (kind) {
        case 'exists':
            if (actual === undefined || actual === null || String(actual).trim() === '') {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to exist.`);
            }
            return null;
        case 'equals':
            if (stringifyComparable(actual) !== stringifyComparable(rule.value)) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to equal ${stringifyComparable(rule.value)}.`);
            }
            return null;
        case 'not_equals':
            if (stringifyComparable(actual) === stringifyComparable(rule.value)) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to differ from ${stringifyComparable(rule.value)}.`);
            }
            return null;
        case 'contains':
            if (!includesValue(actual, rule.value)) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to contain ${stringifyComparable(rule.value)}.`);
            }
            return null;
        case 'not_contains':
            if (includesValue(actual, rule.value)) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} not to contain ${stringifyComparable(rule.value)}.`);
            }
            return null;
        case 'includes_any': {
            const values = Array.isArray(rule.values) ? rule.values : [];
            if (!values.some((candidate) => includesValue(actual, candidate))) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to include at least one allowed value.`);
            }
            return null;
        }
        case 'regex': {
            const pattern = String(rule.pattern || '').trim();
            if (!pattern) {
                return ruleViolation(rule, ruleIndex, actual, 'Regex rule requires "pattern".');
            }
            const candidate = stringifyComparable(actual);
            let expression: RegExp;
            try {
                expression = new RegExp(pattern, String(rule.flags || ''));
            } catch (error: any) {
                return ruleViolation(rule, ruleIndex, actual, `Invalid regex pattern: ${String(error?.message || error)}`);
            }
            if (!expression.test(candidate)) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} to match /${pattern}/${String(rule.flags || '')}.`);
            }
            return null;
        }
        case 'max_length': {
            const actualLength = policyLength(actual);
            const expected = Number(rule.value);
            if (!Number.isFinite(expected)) {
                return ruleViolation(rule, ruleIndex, actual, 'max_length requires numeric "value".');
            }
            if (actualLength === undefined || actualLength > expected) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} length <= ${expected}.`);
            }
            return null;
        }
        case 'min_length': {
            const actualLength = policyLength(actual);
            const expected = Number(rule.value);
            if (!Number.isFinite(expected)) {
                return ruleViolation(rule, ruleIndex, actual, 'min_length requires numeric "value".');
            }
            if (actualLength === undefined || actualLength < expected) {
                return ruleViolation(rule, ruleIndex, actual, `Expected ${rule.path || 'subject'} length >= ${expected}.`);
            }
            return null;
        }
        default:
            return ruleViolation(rule, ruleIndex, actual, `Unsupported policy rule kind "${kind}".`);
    }
}

export async function executeSystemPolicyCheck(args: any): Promise<{ content: string; status: number; statusText: string; data: any }> {
    const mode = String(args?.mode || 'block').trim().toLowerCase() === 'warn' ? 'warn' : 'block';
    const subject = parsePolicySubject(args?.subject);
    const rules = parsePolicyRules(args?.rules);
    const violations = rules
        .map((rule, index) => evaluatePolicyRule(subject, rule, index))
        .filter((violation): violation is PolicyViolation => violation !== null);

    const payload = {
        passed: violations.length === 0,
        mode,
        ruleCount: rules.length,
        violationCount: violations.length,
        subjectType: Array.isArray(subject) ? 'array' : typeof subject,
        evaluatedAt: new Date().toISOString(),
        violations
    };

    emitPolicyLog(args?.__meta, `[policy] evaluated ${rules.length} rule(s), violations=${violations.length}, mode=${mode}`, violations.length > 0 && mode === 'block' ? 'stderr' : 'stdout');
    for (const violation of violations) {
        emitPolicyLog(args?.__meta, `[policy] violation #${violation.ruleIndex + 1}: ${violation.message}`, mode === 'block' ? 'stderr' : 'stdout');
    }

    if (violations.length > 0 && mode === 'block') {
        throw new Error(`Policy check failed with ${violations.length} violation(s).`);
    }

    return {
        content: JSON.stringify(payload),
        status: violations.length > 0 ? 409 : 200,
        statusText: violations.length > 0 ? 'Policy Violations' : 'Policy Passed',
        data: payload
    };
}

function parseFiniteNumber(raw: any, field: string): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`${field} must be a finite number.`);
    }
    return value;
}

function normalizeGuardMode(raw: any): 'warn' | 'block' {
    return String(raw || 'block').trim().toLowerCase() === 'warn' ? 'warn' : 'block';
}

export async function executeSystemBudgetGuard(args: BudgetGuardArgs): Promise<{ content: string; status: number; statusText: string; data: any }> {
    const currentValue = parseFiniteNumber(args?.value, 'system.budget.guard value');
    const limitValue = parseFiniteNumber(args?.limit, 'system.budget.guard limit');
    if (limitValue <= 0) {
        throw new Error('system.budget.guard limit must be greater than 0.');
    }
    const warnAtPctRaw = args?.warnAtPct === undefined || args?.warnAtPct === null || String(args?.warnAtPct).trim() === ''
        ? 80
        : parseFiniteNumber(args?.warnAtPct, 'system.budget.guard warnAtPct');
    const warnAtPct = Math.max(0, warnAtPctRaw);
    const mode = normalizeGuardMode(args?.mode);
    const utilizationPct = (currentValue / limitValue) * 100;
    const remaining = limitValue - currentValue;
    const exceeded = currentValue > limitValue;
    const warning = !exceeded && utilizationPct >= warnAtPct;
    const label = String(args?.label || '').trim() || 'budget';
    const unit = String(args?.unit || '').trim() || undefined;

    const payload = {
        passed: !exceeded,
        mode,
        label,
        unit,
        value: currentValue,
        limit: limitValue,
        remaining,
        utilizationPct,
        warnAtPct,
        warning,
        exceeded,
        evaluatedAt: new Date().toISOString()
    };

    emitPolicyLog(args?.__meta, `[budget] ${label}: value=${currentValue} limit=${limitValue}${unit ? ` ${unit}` : ''} utilization=${utilizationPct.toFixed(2)}%`, exceeded && mode === 'block' ? 'stderr' : 'stdout');
    if (warning) {
        emitPolicyLog(args?.__meta, `[budget] warning threshold reached (${warnAtPct}%) for ${label}`, 'stdout');
    }
    if (exceeded) {
        emitPolicyLog(args?.__meta, `[budget] limit exceeded for ${label}`, mode === 'block' ? 'stderr' : 'stdout');
    }

    if (exceeded && mode === 'block') {
        throw new Error(`Budget guard failed for ${label}: ${currentValue} > ${limitValue}.`);
    }

    return {
        content: JSON.stringify(payload),
        status: exceeded ? 409 : 200,
        statusText: exceeded ? 'Budget Exceeded' : (warning ? 'Budget Warning' : 'Budget OK'),
        data: payload
    };
}

function compactRateLimitBucket(key: string, nowMs: number, windowMs: number): number[] {
    const current = rateLimitBuckets.get(key) || [];
    const minTs = nowMs - windowMs;
    const next = current.filter((timestamp) => timestamp > minTs);
    rateLimitBuckets.set(key, next);
    return next;
}

export async function executeSystemRateLimit(args: RateLimitArgs): Promise<{ content: string; status: number; statusText: string; data: any }> {
    const rawKey = String(args?.key || '').trim();
    if (!rawKey) {
        throw new Error('system.rateLimit requires "key".');
    }
    const scope = String(args?.scope || 'global').trim() || 'global';
    const bucketKey = `${scope}:${rawKey}`;
    const limit = Math.max(1, Math.floor(parseFiniteNumber(args?.limit, 'system.rateLimit limit')));
    const windowMs = Math.max(1, Math.floor(parseFiniteNumber(args?.windowMs, 'system.rateLimit windowMs')));
    const nowMs = args?.nowMs === undefined || args?.nowMs === null || String(args?.nowMs).trim() === ''
        ? Date.now()
        : Math.floor(parseFiniteNumber(args?.nowMs, 'system.rateLimit nowMs'));
    const consume = args?.consume !== false;
    const mode = normalizeGuardMode(args?.mode);

    const bucket = compactRateLimitBucket(bucketKey, nowMs, windowMs);
    const countBefore = bucket.length;
    const projectedCount = countBefore + (consume ? 1 : 0);
    const allowed = projectedCount <= limit;
    if (consume) {
        bucket.push(nowMs);
        rateLimitBuckets.set(bucketKey, bucket);
    }
    const effectiveCount = consume ? bucket.length : countBefore;
    const oldestRelevant = bucket[0];
    const resetAt = typeof oldestRelevant === 'number' ? oldestRelevant + windowMs : nowMs + windowMs;
    const remaining = Math.max(0, limit - effectiveCount);

    const payload = {
        allowed,
        mode,
        key: rawKey,
        scope,
        bucketKey,
        consume,
        limit,
        windowMs,
        count: effectiveCount,
        remaining,
        resetAt,
        checkedAt: nowMs
    };

    emitPolicyLog(args?.__meta, `[rateLimit] ${bucketKey} count=${effectiveCount}/${limit} windowMs=${windowMs} consume=${consume}`, !allowed && mode === 'block' ? 'stderr' : 'stdout');

    if (!allowed && mode === 'block') {
        throw new Error(`Rate limit exceeded for ${bucketKey}: ${effectiveCount}/${limit} in ${windowMs}ms.`);
    }

    return {
        content: JSON.stringify(payload),
        status: allowed ? 200 : 429,
        statusText: allowed ? 'Rate Limit OK' : 'Rate Limit Exceeded',
        data: payload
    };
}

export const __test = {
    resetRateLimitBuckets(): void {
        rateLimitBuckets.clear();
    }
};

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

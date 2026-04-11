import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';

type RunMeta = {
    runId?: string;
    traceId?: string;
    stepId?: string;
};

type RunMetricArgs = {
    key?: string;
    value?: number | string;
    label?: string;
    unit?: string;
    aggregation?: string;
    tags?: string;
    __meta?: RunMeta;
};

type RunAlertArgs = {
    level?: string;
    title?: string;
    message?: string;
    details?: string;
    __meta?: RunMeta;
};

function emitRunStepLog(meta: RunMeta | undefined, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
    const runId = meta?.runId;
    const intentId = meta?.traceId || '';
    const stepId = meta?.stepId;
    if (!runId || !intentId) {
        return;
    }
    pipelineEventBus.emit({
        type: 'stepLog',
        runId,
        intentId,
        stepId,
        text: text.endsWith('\n') ? text : `${text}\n`,
        stream
    });
}

function parseTags(raw: any): string[] {
    const value = String(raw ?? '').trim();
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean);
        }
    } catch {
        // fall through to CSV parsing
    }
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function parseAlertDetails(raw: any): any {
    const value = String(raw ?? '').trim();
    if (!value) return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

export function registerRunProvider(_context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'run',
        type: 'vscode',
        capabilities: [
            {
                capability: 'run.metric',
                command: 'intentRouter.internal.runMetric',
                description: 'Record a metric during a pipeline run',
                determinism: 'deterministic',
                args: [
                    { name: 'key', type: 'string', description: 'Metric key', required: true },
                    { name: 'value', type: 'string', description: 'Metric numeric value', required: true },
                    { name: 'label', type: 'string', description: 'Metric label', required: false },
                    { name: 'unit', type: 'string', description: 'Metric unit', required: false },
                    { name: 'aggregation', type: 'enum', options: ['gauge', 'counter'], description: 'Aggregation mode', default: 'gauge' },
                    { name: 'tags', type: 'string', description: 'CSV or JSON array of tags', required: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the metric payload', required: false }
                ]
            },
            {
                capability: 'run.alert',
                command: 'intentRouter.internal.runAlert',
                description: 'Raise a runtime alert during a pipeline run',
                determinism: 'deterministic',
                args: [
                    { name: 'level', type: 'enum', options: ['info', 'warn', 'error'], description: 'Alert level', default: 'warn' },
                    { name: 'title', type: 'string', description: 'Optional alert title', required: false },
                    { name: 'message', type: 'string', description: 'Alert message', required: true },
                    { name: 'details', type: 'string', description: 'Optional JSON or plain text details', required: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the alert payload', required: false }
                ]
            }
        ]
    });
}

export async function executeRunMetricCommand(args: RunMetricArgs): Promise<{ content: string; data: any }> {
    const key = String(args?.key || '').trim();
    if (!key) {
        throw new Error('run.metric requires "key".');
    }
    const numericValue = Number(args?.value);
    if (!Number.isFinite(numericValue)) {
        throw new Error('run.metric requires a numeric "value".');
    }
    const aggregation: 'gauge' | 'counter' =
        String(args?.aggregation || 'gauge').trim().toLowerCase() === 'counter' ? 'counter' : 'gauge';
    const payload = {
        key,
        value: numericValue,
        label: String(args?.label || '').trim() || undefined,
        unit: String(args?.unit || '').trim() || undefined,
        aggregation,
        tags: parseTags(args?.tags)
    };

    if (args?.__meta?.runId && args?.__meta?.traceId) {
        pipelineEventBus.emit({
            type: 'runMetricRecorded',
            runId: String(args.__meta.runId),
            intentId: String(args.__meta.traceId),
            stepId: args.__meta.stepId,
            ...payload
        });
    }
    emitRunStepLog(args?.__meta, `[run.metric] ${key}=${numericValue}${payload.unit ? ` ${payload.unit}` : ''}`, 'stdout');
    return {
        content: JSON.stringify(payload),
        data: payload
    };
}

export async function executeRunAlertCommand(args: RunAlertArgs): Promise<{ content: string; data: any }> {
    const level = String(args?.level || 'warn').trim().toLowerCase();
    const normalizedLevel = level === 'info' || level === 'error' ? level : 'warn';
    const message = String(args?.message || '').trim();
    if (!message) {
        throw new Error('run.alert requires "message".');
    }
    const payload = {
        level: normalizedLevel as 'info' | 'warn' | 'error',
        title: String(args?.title || '').trim() || undefined,
        message,
        details: parseAlertDetails(args?.details)
    };

    if (args?.__meta?.runId && args?.__meta?.traceId) {
        pipelineEventBus.emit({
            type: 'runAlertRaised',
            runId: String(args.__meta.runId),
            intentId: String(args.__meta.traceId),
            stepId: args.__meta.stepId,
            ...payload
        });
    }
    emitRunStepLog(args?.__meta, `[run.alert] ${payload.level.toUpperCase()} ${payload.title ? `${payload.title}: ` : ''}${payload.message}`, payload.level === 'error' ? 'stderr' : 'stdout');
    return {
        content: JSON.stringify(payload),
        data: payload
    };
}

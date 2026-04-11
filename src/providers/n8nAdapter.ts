import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';

type N8nMeta = {
    runId?: string;
    traceId?: string;
    stepId?: string;
};

type N8nManageArgs = {
    baseUrl?: string;
    apiKey?: string;
    apiVersion?: string;
    operation?: string;
    workflowId?: string;
    executionId?: string;
    active?: boolean | string;
    status?: string;
    includeData?: boolean | string;
    limit?: number | string;
    __meta?: N8nMeta;
};

type N8nWebhookInvokeArgs = {
    url?: string;
    method?: string;
    headers?: string;
    body?: string;
    __meta?: N8nMeta;
};

type N8nResponse = {
    content: string;
    status: number;
    statusText: string;
    data?: any;
};

export function registerN8nProvider(_context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'n8n',
        type: 'vscode',
        capabilities: [
            {
                capability: 'n8n.manage',
                command: 'intentRouter.internal.n8nManage',
                description: 'Manage n8n workflows through the public API',
                determinism: 'deterministic',
                args: [
                    { name: 'baseUrl', type: 'string', description: 'n8n instance base URL', required: true },
                    { name: 'apiKey', type: 'string', description: 'n8n API key', required: true },
                    { name: 'apiVersion', type: 'string', description: 'n8n API version', default: 'v1' },
                    { name: 'operation', type: 'enum', options: ['listWorkflows', 'getWorkflow', 'activateWorkflow', 'deactivateWorkflow', 'listExecutions'], description: 'Workflow operation', required: true },
                    { name: 'workflowId', type: 'string', description: 'Workflow ID for workflow-scoped operations' },
                    { name: 'executionId', type: 'string', description: 'Execution ID for execution-scoped operations' },
                    { name: 'active', type: 'enum', options: ['true', 'false'], description: 'Optional active filter for listWorkflows' },
                    { name: 'status', type: 'string', description: 'Optional execution status filter for listExecutions' },
                    { name: 'includeData', type: 'enum', options: ['true', 'false'], description: 'Include execution payload data for listExecutions', default: 'false' },
                    { name: 'limit', type: 'string', description: 'Optional limit for listWorkflows' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the API response body' },
                    { name: 'outputVarStatusCode', type: 'string', description: 'Variable to store the HTTP status code' },
                    { name: 'outputVarStatusText', type: 'string', description: 'Variable to store the HTTP status text' },
                    { name: 'outputVarData', type: 'string', description: 'Variable to store the parsed JSON data' }
                ]
            },
            {
                capability: 'n8n.webhook.invoke',
                command: 'intentRouter.internal.n8nWebhookInvoke',
                description: 'Invoke an n8n webhook endpoint and capture its response',
                determinism: 'deterministic',
                args: [
                    { name: 'url', type: 'string', description: 'Webhook URL', required: true },
                    { name: 'method', type: 'enum', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method', default: 'POST' },
                    { name: 'headers', type: 'string', description: 'JSON string of headers', default: '{}' },
                    { name: 'body', type: 'string', description: 'Request body', default: '' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the webhook response body' },
                    { name: 'outputVarStatusCode', type: 'string', description: 'Variable to store the HTTP status code' },
                    { name: 'outputVarStatusText', type: 'string', description: 'Variable to store the HTTP status text' },
                    { name: 'outputVarData', type: 'string', description: 'Variable to store the parsed JSON data' }
                ]
            }
        ]
    });
}

function emitN8nStepLog(meta: N8nMeta | undefined, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
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

function normalizeN8nApiBaseUrl(rawBaseUrl: string, rawApiVersion: string | undefined): string {
    const baseUrl = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
    const apiVersion = String(rawApiVersion || 'v1').trim().replace(/^\/+|\/+$/g, '') || 'v1';
    if (!baseUrl) {
        throw new Error('n8n.manage requires "baseUrl".');
    }
    if (/\/api\/v\d+$/i.test(baseUrl)) {
        return baseUrl;
    }
    if (/\/api$/i.test(baseUrl)) {
        return `${baseUrl}/${apiVersion}`;
    }
    return `${baseUrl}/api/${apiVersion}`;
}

function parseJsonObject(raw: any, label: string): Record<string, any> {
    const text = String(raw ?? '').trim();
    if (!text) {
        return {};
    }
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`${label} must be a JSON object.`);
        }
        return parsed as Record<string, any>;
    } catch (error: any) {
        throw new Error(`${label} must be valid JSON: ${String(error?.message || error)}`);
    }
}

async function parseFetchResponse(response: any): Promise<N8nResponse> {
    const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        const data = await response.json();
        return {
            content: JSON.stringify(data, null, 2),
            status: Number(response?.status || 0),
            statusText: String(response?.statusText || ''),
            data
        };
    }
    const text = await response.text();
    return {
        content: text,
        status: Number(response?.status || 0),
        statusText: String(response?.statusText || '')
    };
}

async function executeN8nApiRequest(input: {
    url: string;
    method: string;
    apiKey?: string;
    body?: string;
    headers?: Record<string, any>;
    meta?: N8nMeta;
    label: string;
}): Promise<N8nResponse> {
    const fetchFn = (global as any).fetch as any;
    if (!fetchFn) {
        throw new Error('Fetch API not available in this environment.');
    }

    const headers: Record<string, string> = {
        accept: 'application/json',
        ...(input.apiKey ? { 'X-N8N-API-KEY': String(input.apiKey) } : {}),
        ...Object.fromEntries(Object.entries(input.headers || {}).map(([key, value]) => [String(key), String(value)]))
    };

    if (input.body && !headers['content-type'] && !headers['Content-Type']) {
        headers['content-type'] = 'application/json';
    }

    emitN8nStepLog(input.meta, `[n8n] ${input.label}: ${input.method.toUpperCase()} ${input.url}`, 'stdout');
    if (input.body) {
        emitN8nStepLog(input.meta, `[n8n] body: ${input.body}`, 'stdout');
    }

    const response = await fetchFn(input.url, {
        method: input.method,
        headers,
        body: input.body
    });
    const parsed = await parseFetchResponse(response);
    emitN8nStepLog(input.meta, `[n8n] status: ${parsed.status} ${parsed.statusText}`, response.ok ? 'stdout' : 'stderr');
    emitN8nStepLog(input.meta, `[n8n] response:\n${parsed.content}`, response.ok ? 'stdout' : 'stderr');

    if (!response.ok) {
        throw new Error(`n8n API error: ${parsed.status} ${parsed.statusText}`);
    }

    return parsed;
}

export async function executeN8nManageCommand(args: N8nManageArgs): Promise<N8nResponse> {
    const operation = String(args?.operation || '').trim();
    const apiBaseUrl = normalizeN8nApiBaseUrl(String(args?.baseUrl || ''), args?.apiVersion);
    const apiKey = String(args?.apiKey || '').trim();
    if (!apiKey) {
        throw new Error('n8n.manage requires "apiKey".');
    }

    switch (operation) {
        case 'listWorkflows': {
            const params = new URLSearchParams();
            const activeRaw = String(args?.active ?? '').trim().toLowerCase();
            const limitRaw = String(args?.limit ?? '').trim();
            if (activeRaw === 'true' || activeRaw === 'false') {
                params.set('active', activeRaw);
            }
            if (limitRaw) {
                params.set('limit', limitRaw);
            }
            const url = `${apiBaseUrl}/workflows${params.toString() ? `?${params.toString()}` : ''}`;
            return executeN8nApiRequest({
                url,
                method: 'GET',
                apiKey,
                meta: args?.__meta,
                label: 'listWorkflows'
            });
        }
        case 'getWorkflow': {
            const workflowId = String(args?.workflowId || '').trim();
            if (!workflowId) {
                throw new Error('n8n.manage getWorkflow requires "workflowId".');
            }
            return executeN8nApiRequest({
                url: `${apiBaseUrl}/workflows/${encodeURIComponent(workflowId)}`,
                method: 'GET',
                apiKey,
                meta: args?.__meta,
                label: 'getWorkflow'
            });
        }
        case 'activateWorkflow': {
            const workflowId = String(args?.workflowId || '').trim();
            if (!workflowId) {
                throw new Error('n8n.manage activateWorkflow requires "workflowId".');
            }
            return executeN8nApiRequest({
                url: `${apiBaseUrl}/workflows/${encodeURIComponent(workflowId)}/activate`,
                method: 'POST',
                apiKey,
                meta: args?.__meta,
                label: 'activateWorkflow'
            });
        }
        case 'deactivateWorkflow': {
            const workflowId = String(args?.workflowId || '').trim();
            if (!workflowId) {
                throw new Error('n8n.manage deactivateWorkflow requires "workflowId".');
            }
            return executeN8nApiRequest({
                url: `${apiBaseUrl}/workflows/${encodeURIComponent(workflowId)}/deactivate`,
                method: 'POST',
                apiKey,
                meta: args?.__meta,
                label: 'deactivateWorkflow'
            });
        }
        case 'listExecutions': {
            const params = new URLSearchParams();
            const workflowId = String(args?.workflowId || '').trim();
            const status = String(args?.status || '').trim();
            const includeDataRaw = String(args?.includeData ?? '').trim().toLowerCase();
            const limitRaw = String(args?.limit ?? '').trim();
            if (workflowId) {
                params.set('workflowId', workflowId);
            }
            if (status) {
                params.set('status', status);
            }
            if (includeDataRaw === 'true' || includeDataRaw === 'false') {
                params.set('includeData', includeDataRaw);
            }
            if (limitRaw) {
                params.set('limit', limitRaw);
            }
            return executeN8nApiRequest({
                url: `${apiBaseUrl}/executions${params.toString() ? `?${params.toString()}` : ''}`,
                method: 'GET',
                apiKey,
                meta: args?.__meta,
                label: 'listExecutions'
            });
        }
        default:
            throw new Error(`Unsupported n8n.manage operation "${operation}".`);
    }
}

export async function executeN8nWebhookInvokeCommand(args: N8nWebhookInvokeArgs): Promise<N8nResponse> {
    const url = String(args?.url || '').trim();
    if (!url) {
        throw new Error('n8n.webhook.invoke requires "url".');
    }
    const method = String(args?.method || 'POST').trim().toUpperCase() || 'POST';
    const headers = parseJsonObject(args?.headers || '{}', 'n8n.webhook.invoke headers');
    const body = String(args?.body || '');

    return executeN8nApiRequest({
        url,
        method,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        headers,
        meta: args?.__meta,
        label: 'webhook.invoke'
    });
}

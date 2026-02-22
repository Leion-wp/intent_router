import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';

export function registerHttpProvider(context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'http',
        type: 'vscode',
        capabilities: [
            {
                capability: 'http.request',
                command: 'intentRouter.internal.httpRequest',
                description: 'Make an HTTP request to an external API',
                determinism: 'deterministic',
                args: [
                    { name: 'url', type: 'string', description: 'Target URL', required: true },
                    { name: 'method', type: 'enum', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP Method', default: 'GET' },
                    { name: 'headers', type: 'string', description: 'JSON string of headers', default: '{}' },
                    { name: 'body', type: 'string', description: 'Request body', default: '' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store response body' }
                ]
            }
        ]
    });
}

export async function executeHttpCommand(args: any): Promise<any> {
    const url = args?.url;
    const method = args?.method || 'GET';
    const headersRaw = args?.headers || '{}';
    const body = args?.body || '';
    const meta = args?.__meta;

    if (!url) {
        throw new Error('HTTP Request: URL is required');
    }

    const runId = meta?.runId;
    const stepId = meta?.stepId;
    const intentId = meta?.traceId || 'unknown';

    const log = (text: string, stream: 'stdout' | 'stderr' = 'stdout') => {
        if (runId) {
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                stepId,
                text: text + '\n',
                stream
            });
        }
    };

    log(`[HTTP] Sending ${method} request to: ${url}`);
    if (body) {
        log(`[HTTP] Request Body: ${body}`);
    }

    try {
        let headers = {};
        try {
            headers = JSON.parse(headersRaw);
        } catch (e) {
            log(`[HTTP] Error parsing headers: ${e}`, 'stderr');
        }

        const fetchFn = (global as any).fetch;
        if (!fetchFn) {
            throw new Error('Fetch API not available in this environment.');
        }

        const options: any = {
            method,
            headers,
            body: method !== 'GET' && method !== 'HEAD' ? body : undefined
        };

        const response = await fetchFn(url, options);
        const responseText = await response.text();
        
        log(`[HTTP] Status: ${response.status} ${response.statusText}`);
        
        // LOG THE RESPONSE CONTENT
        log(`[HTTP] Response Body:\n${responseText}`);
        
        if (!response.ok) {
            log(`[HTTP] Error Response: ${responseText}`, 'stderr');
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        return responseText;

    } catch (error: any) {
        log(`[HTTP] Request failed: ${error.message}`, 'stderr');
        throw error;
    }
}

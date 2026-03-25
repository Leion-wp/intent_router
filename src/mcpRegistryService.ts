import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';
import { SalesCockpitMcpServer, SalesCockpitMcpTool } from './salesCockpitStore';

const MCP_PROTOCOL_VERSION = '2025-11-25';

type JsonRpcResponse<T> = {
    id?: number | string;
    result?: T;
    error?: {
        code?: number;
        message?: string;
        data?: unknown;
    };
};

type McpInitializeResult = {
    protocolVersion?: string;
    serverInfo?: {
        name?: string;
        version?: string;
    };
};

type McpToolsListResult = {
    tools?: Array<{
        name?: string;
        title?: string;
        description?: string;
        inputSchema?: unknown;
    }>;
};

type DiscoveryResult = {
    tools: SalesCockpitMcpTool[];
    status: SalesCockpitMcpServer['status'];
    note: string;
};

function safeJsonStringify(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value || '');
    }
}

function summarizeSchema(schema: unknown): string | undefined {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }
    const properties = Object.keys((schema as any).properties || {});
    if (properties.length === 0) {
        return safeJsonStringify(schema).slice(0, 200);
    }
    return `Fields: ${properties.join(', ')}`;
}

function normalizeTools(tools: McpToolsListResult['tools']): SalesCockpitMcpTool[] {
    if (!Array.isArray(tools)) {
        return [];
    }
    const entries: Array<SalesCockpitMcpTool | null> = tools.map((tool) => {
        const name = String(tool?.name || '').trim();
        if (!name) {
            return null;
        }
        return {
            name,
            title: tool?.title ? String(tool.title).trim() : undefined,
            description: tool?.description ? String(tool.description).trim() : undefined,
            inputSchemaSummary: summarizeSchema(tool?.inputSchema)
        };
    });
    return entries.filter((entry): entry is SalesCockpitMcpTool => entry !== null);
}

function createInitializePayload() {
    return {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
                name: 'Leion Cockpit',
                version: '0.1.13'
            }
        }
    };
}

function createInitializedNotification() {
    return {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
    };
}

function createToolsListPayload() {
    return {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    };
}

function jsonRequest<T>(urlString: string, method: 'GET' | 'POST', body?: string, extraHeaders?: Record<string, string>): Promise<{ headers: http.IncomingHttpHeaders; body: T }> {
    const url = new URL(urlString);
    const transport = url.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
        const request = transport.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || undefined,
                path: `${url.pathname}${url.search}`,
                method,
                headers: {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
                    ...extraHeaders
                }
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                response.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    if (response.statusCode && response.statusCode >= 400) {
                        reject(new Error(raw || `HTTP ${response.statusCode}`));
                        return;
                    }
                    try {
                        resolve({
                            headers: response.headers,
                            body: raw ? JSON.parse(raw) as T : ({} as T)
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        request.on('error', reject);
        if (body) {
            request.write(body);
        }
        request.end();
    });
}

async function discoverHttpServer(server: SalesCockpitMcpServer): Promise<DiscoveryResult> {
    if (!server.endpointUrl) {
        throw new Error('Missing MCP endpoint URL.');
    }

    const initializeResponse = await jsonRequest<JsonRpcResponse<McpInitializeResult>>(
        server.endpointUrl,
        'POST',
        JSON.stringify(createInitializePayload()),
        { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION }
    );
    if (initializeResponse.body.error) {
        throw new Error(initializeResponse.body.error.message || 'MCP initialize failed.');
    }

    const sessionIdHeader = initializeResponse.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const headers: Record<string, string> = {
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION
    };
    if (sessionId) {
        headers['MCP-Session-Id'] = sessionId;
    }

    await jsonRequest<JsonRpcResponse<unknown>>(
        server.endpointUrl,
        'POST',
        JSON.stringify(createInitializedNotification()),
        headers
    );

    const toolsResponse = await jsonRequest<JsonRpcResponse<McpToolsListResult>>(
        server.endpointUrl,
        'POST',
        JSON.stringify(createToolsListPayload()),
        headers
    );
    if (toolsResponse.body.error) {
        throw new Error(toolsResponse.body.error.message || 'MCP tools/list failed.');
    }

    const tools = normalizeTools(toolsResponse.body.result?.tools);
    const serverInfo = initializeResponse.body.result?.serverInfo;
    const note = serverInfo?.name
        ? `Connected to ${serverInfo.name}${serverInfo.version ? ` ${serverInfo.version}` : ''}.`
        : 'Connected and listed MCP tools.';

    return {
        tools,
        status: 'connected',
        note
    };
}

async function discoverStdioServer(server: SalesCockpitMcpServer): Promise<DiscoveryResult> {
    if (!server.command) {
        throw new Error('Missing stdio command.');
    }

    const child = spawn(server.command, server.args || [], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
    });

    let stdout = '';
    let stderr = '';
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const cleanup = () => {
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        child.kill();
    };

    const readResponse = (id: number) => new Promise<any>((resolve, reject) => {
        pending.set(id, { resolve, reject });
    });

    const flushStdout = () => {
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || '';
        for (const line of lines.map((entry) => entry.trim()).filter(Boolean)) {
            try {
                const parsed = JSON.parse(line);
                if (typeof parsed?.id !== 'undefined' && pending.has(Number(parsed.id))) {
                    const waiter = pending.get(Number(parsed.id))!;
                    pending.delete(Number(parsed.id));
                    waiter.resolve(parsed);
                }
            } catch {
                // Ignore non-JSON lines from stdio servers.
            }
        }
    };

    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
        flushStdout();
    });
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
    });

    const timeout = setTimeout(() => {
        for (const waiter of pending.values()) {
            waiter.reject(new Error('Timed out waiting for MCP stdio response.'));
        }
        pending.clear();
        cleanup();
    }, 15000);

    try {
        child.stdin.write(`${JSON.stringify(createInitializePayload())}\n`);
        const initialize = await readResponse(1) as JsonRpcResponse<McpInitializeResult>;
        if (initialize.error) {
            throw new Error(initialize.error.message || 'MCP initialize failed.');
        }

        child.stdin.write(`${JSON.stringify(createInitializedNotification())}\n`);
        child.stdin.write(`${JSON.stringify(createToolsListPayload())}\n`);
        const toolsResponse = await readResponse(2) as JsonRpcResponse<McpToolsListResult>;
        if (toolsResponse.error) {
            throw new Error(toolsResponse.error.message || 'MCP tools/list failed.');
        }

        return {
            tools: normalizeTools(toolsResponse.result?.tools),
            status: 'connected',
            note: initialize.result?.serverInfo?.name
                ? `Connected to ${initialize.result.serverInfo.name}.`
                : 'Connected and listed MCP tools.'
        };
    } catch (error: any) {
        const detail = stderr.trim();
        throw new Error(detail ? `${error?.message || error}\n${detail}` : error?.message || String(error));
    } finally {
        clearTimeout(timeout);
        cleanup();
    }
}

export async function discoverMcpTools(server: SalesCockpitMcpServer): Promise<DiscoveryResult> {
    if (server.transport === 'stdio') {
        return discoverStdioServer(server);
    }
    if (server.transport === 'sse') {
        throw new Error('SSE discovery is not implemented yet. Prefer the HTTP endpoint for tool discovery.');
    }
    return discoverHttpServer(server);
}

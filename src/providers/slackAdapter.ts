import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { validateSafeRelativePath } from '../security';

type Response = any;

type SlackMeta = {
    runId?: string;
    traceId?: string;
    stepId?: string;
};

type SlackSendArgs = {
    webhookUrl?: string;
    channel?: string;
    text?: string;
    username?: string;
    iconEmoji?: string;
    blocks?: string;
    attachments?: string;
    mode?: string;
    __meta?: SlackMeta;
};

type SlackListenArgs = {
    sourcePath?: string;
    mode?: string;
    limit?: string | number;
    includeText?: boolean;
    outputVar?: string;
    outputVarStatusCode?: string;
    outputVarStatusText?: string;
    outputVarData?: string;
    __meta?: SlackMeta;
};

type SlackResult = {
    content: string;
    status: number;
    statusText: string;
    data: any;
};

type SlackItem = {
    id: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    threadTs?: string;
    source: 'workspace_file';
};

function emitSlackStepLog(meta: SlackMeta | undefined, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
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

function resolveWorkspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return path.resolve(folder?.fsPath || folder?.path || process.cwd());
}

function normalizeSlackSendMode(raw: any): 'auto' | 'webhook' | 'preview' {
    const value = String(raw ?? 'auto').trim().toLowerCase();
    if (value === 'webhook' || value === 'preview') {
        return value;
    }
    return 'auto';
}

function normalizeSlackListenMode(raw: any): 'auto' | 'file' {
    const value = String(raw ?? 'auto').trim().toLowerCase();
    return value === 'file' ? 'file' : 'auto';
}

function parseMaybeJson(raw: any): any {
    const value = String(raw ?? '').trim();
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function parseJsonArray(raw: any): any[] | undefined {
    const parsed = parseMaybeJson(raw);
    return Array.isArray(parsed) ? parsed : undefined;
}

function buildPreviewPayload(args: SlackSendArgs): Record<string, any> {
    return {
        deliveryMode: 'preview',
        provider: 'slack',
        transport: 'preview',
        channel: String(args?.channel || '').trim() || undefined,
        text: String(args?.text || '').trim(),
        username: String(args?.username || '').trim() || undefined,
        iconEmoji: String(args?.iconEmoji || '').trim() || undefined,
        blocks: parseJsonArray(args?.blocks),
        attachments: parseJsonArray(args?.attachments),
        sentAt: new Date().toISOString(),
        note: 'No webhook URL was provided. This is a deterministic preview only.'
    };
}

function resolveSlackSourceCandidates(rawPath: any): string[] {
    const workspaceRoot = resolveWorkspaceRoot();
    const raw = String(rawPath || '').trim();
    const candidates: string[] = [];

    if (!raw) {
        candidates.push(path.join(workspaceRoot, 'leion-roots.slack.inbox.jsonl'));
        candidates.push(path.join(workspaceRoot, 'leion-roots.slack.inbox.json'));
        candidates.push(path.join(workspaceRoot, 'leion-roots.slack.queue.jsonl'));
        candidates.push(path.join(workspaceRoot, 'leion-roots.slack.queue.json'));
        return candidates;
    }

    const candidate = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(workspaceRoot, raw);
    validateSafeRelativePath(candidate, workspaceRoot, workspaceRoot);
    candidates.push(candidate);
    if (candidate.endsWith('.jsonl')) {
        candidates.push(candidate.replace(/\.jsonl$/i, '.json'));
    } else if (candidate.endsWith('.json')) {
        candidates.push(candidate.replace(/\.json$/i, '.jsonl'));
    } else {
        candidates.push(`${candidate}.jsonl`);
        candidates.push(`${candidate}.json`);
    }
    return Array.from(new Set(candidates));
}

function parseSlackItem(raw: any, index: number): SlackItem {
    const entry = raw && typeof raw === 'object' ? raw : {};
    return {
        id: String(entry.id || entry.ts || entry.timestamp || `slack-${index + 1}`),
        source: 'workspace_file',
        channel: String(entry.channel || entry.room || '').trim() || undefined,
        user: String(entry.user || entry.sender || '').trim() || undefined,
        text: String(entry.text || entry.message || entry.body || '').trim() || undefined,
        ts: String(entry.ts || entry.timestamp || '').trim() || undefined,
        threadTs: String(entry.threadTs || entry.thread_ts || '').trim() || undefined
    };
}

function parseSlackSource(text: string, filePath: string): SlackItem[] {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        return [];
    }

    const normalizedPath = String(filePath || '').toLowerCase();
    if (normalizedPath.endsWith('.jsonl')) {
        return trimmed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => {
                try {
                    return parseSlackItem(JSON.parse(line), index);
                } catch {
                    return parseSlackItem({ id: `line-${index + 1}`, text: line }, index);
                }
            });
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.map((entry, index) => parseSlackItem(entry, index));
        }
        if (parsed && typeof parsed === 'object') {
            const items = Array.isArray((parsed as any).items)
                ? (parsed as any).items
                : Array.isArray((parsed as any).messages)
                    ? (parsed as any).messages
                    : Array.isArray((parsed as any).events)
                        ? (parsed as any).events
                        : [];
            if (items.length > 0) {
                return items.map((entry: any, index: number) => parseSlackItem(entry, index));
            }
            return [parseSlackItem(parsed, 0)];
        }
    } catch {
        // fall through to line-based parsing
    }

    return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => parseSlackItem({ id: `line-${index + 1}`, text: line }, index));
}

function readSlackItems(filePath: string): SlackItem[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
        return [];
    }
    return parseSlackSource(content, filePath);
}

function buildSlackSendResult(data: any, status: number, statusText: string): SlackResult {
    return {
        content: JSON.stringify(data, null, 2),
        status,
        statusText,
        data
    };
}

function buildSlackListenResult(items: SlackItem[], sourceLabel: string, sourcePath?: string): SlackResult {
    const payload = {
        source: sourceLabel,
        sourcePath: sourcePath || undefined,
        itemCount: items.length,
        items,
        retrievedAt: new Date().toISOString()
    };
    return buildSlackSendResult(payload, 200, 'OK');
}

async function parseResponseBody(response: any): Promise<{ content: string; data: any }> {
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    const text = await response.text();
    if (contentType.includes('application/json')) {
        try {
            return { content: text, data: JSON.parse(text) };
        } catch {
            return { content: text, data: text };
        }
    }
    try {
        return { content: text, data: JSON.parse(text) };
    } catch {
        return { content: text, data: text };
    }
}

async function sendSlackWebhook(args: SlackSendArgs): Promise<SlackResult> {
    const webhookUrl = String(args?.webhookUrl || '').trim();
    if (!webhookUrl) {
        throw new Error('slack.send requires "webhookUrl" in webhook mode.');
    }
    const text = String(args?.text || '').trim();
    if (!text) {
        throw new Error('slack.send requires "text".');
    }

    const payload = {
        channel: String(args?.channel || '').trim() || undefined,
        text,
        username: String(args?.username || '').trim() || undefined,
        icon_emoji: String(args?.iconEmoji || '').trim() || undefined,
        blocks: parseJsonArray(args?.blocks),
        attachments: parseJsonArray(args?.attachments)
    };

    emitSlackStepLog(args?.__meta, `[slack.send] webhook path selected for ${payload.channel || '(no channel)'}`);
    emitSlackStepLog(args?.__meta, `[slack.send] POST ${new URL(webhookUrl).host}`);

    const fetchFn = (global as any).fetch;
    if (!fetchFn) {
        throw new Error('Fetch API not available in this environment.');
    }

    const response = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const parsed = await parseResponseBody(response);
    emitSlackStepLog(args?.__meta, `[slack.send] status: ${response.status} ${response.statusText}`, response.ok ? 'stdout' : 'stderr');
    emitSlackStepLog(args?.__meta, `[slack.send] response:\n${parsed.content}`, response.ok ? 'stdout' : 'stderr');

    if (!response.ok) {
        throw new Error(`Slack webhook error: ${response.status} ${response.statusText}`);
    }

    const result = {
        deliveryMode: 'webhook',
        provider: 'slack',
        transport: 'webhook',
        channel: payload.channel,
        text,
        username: payload.username,
        iconEmoji: payload.icon_emoji,
        blocks: payload.blocks,
        attachments: payload.attachments,
        responseStatus: response.status,
        responseStatusText: response.statusText,
        response: parsed.data,
        sentAt: new Date().toISOString()
    };

    return buildSlackSendResult(result, response.status, response.statusText || 'OK');
}

function buildSlackPreviewResult(args: SlackSendArgs): SlackResult {
    const payload = buildPreviewPayload(args);
    emitSlackStepLog(args?.__meta, `[slack.send] preview generated for ${payload.channel || '(no channel)'}`);
    return buildSlackSendResult(payload, 202, 'Accepted');
}

export function registerSlackProvider(context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'slack',
        type: 'vscode',
        capabilities: [
            {
                capability: 'slack.send',
                command: 'intentRouter.internal.slackSend',
                description: 'Send a Slack message through a webhook or return a deterministic preview',
                determinism: 'deterministic',
                args: [
                    { name: 'webhookUrl', type: 'string', description: 'Slack incoming webhook URL' },
                    { name: 'channel', type: 'string', description: 'Channel name or ID', required: false },
                    { name: 'text', type: 'string', description: 'Slack message text', required: true },
                    { name: 'username', type: 'string', description: 'Optional display name', required: false },
                    { name: 'iconEmoji', type: 'string', description: 'Optional icon emoji', required: false },
                    { name: 'blocks', type: 'string', description: 'JSON array of Slack blocks', required: false },
                    { name: 'attachments', type: 'string', description: 'JSON array of attachments', required: false },
                    { name: 'mode', type: 'enum', options: ['auto', 'webhook', 'preview'], description: 'Delivery mode', default: 'auto' }
                ]
            },
            {
                capability: 'slack.listen',
                command: 'intentRouter.internal.slackListen',
                description: 'Read Slack messages from a local JSON or JSONL queue file',
                determinism: 'deterministic',
                args: [
                    { name: 'sourcePath', type: 'path', description: 'Queue file path inside the workspace', default: 'leion-roots.slack.inbox.jsonl' },
                    { name: 'mode', type: 'enum', options: ['auto', 'file'], description: 'Listen source mode', default: 'auto' },
                    { name: 'limit', type: 'string', description: 'Maximum number of items to return', default: '20' },
                    { name: 'includeText', type: 'boolean', description: 'Keep the text field in parsed items', default: true },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the response payload' }
                ]
            }
        ]
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.slackSend', async (args: SlackSendArgs) => {
            return await executeSlackSendCommand(args);
        }),
        vscode.commands.registerCommand('intentRouter.internal.slackListen', async (args: SlackListenArgs) => {
            return await executeSlackListenCommand(args);
        })
    );
}

export async function executeSlackSendCommand(args: SlackSendArgs): Promise<SlackResult> {
    const mode = normalizeSlackSendMode(args?.mode);
    const hasWebhook = String(args?.webhookUrl || '').trim().length > 0;
    const text = String(args?.text || '').trim();
    if (!text) {
        throw new Error('slack.send requires "text".');
    }

    if (mode === 'preview' || (!hasWebhook && mode === 'auto')) {
        return buildSlackPreviewResult(args);
    }

    return await sendSlackWebhook(args);
}

export async function executeSlackListenCommand(args: SlackListenArgs): Promise<SlackResult> {
    const mode = normalizeSlackListenMode(args?.mode);
    const limitRaw = Number(args?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 20;
    const includeText = args?.includeText !== false;
    const candidates = resolveSlackSourceCandidates(args?.sourcePath);

    emitSlackStepLog(args?.__meta, `[slack.listen] mode=${mode} limit=${limit}`);

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) {
            continue;
        }
        emitSlackStepLog(args?.__meta, `[slack.listen] reading file ${candidate}`);
        const items = readSlackItems(candidate)
            .slice(-limit)
            .map((item) => ({
                ...item,
                text: includeText ? item.text : undefined
            }));
        emitSlackStepLog(args?.__meta, `[slack.listen] items=${items.length}`);
        return buildSlackListenResult(items, 'workspace_file', candidate);
    }

    if (mode === 'file') {
        emitSlackStepLog(args?.__meta, '[slack.listen] no queue file found', 'stderr');
    } else {
        emitSlackStepLog(args?.__meta, '[slack.listen] no queue file found, returning empty result', 'stderr');
    }

    return buildSlackListenResult([], 'empty');
}

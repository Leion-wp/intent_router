import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { createGmailDraft } from '../gmailDraftService';
import { hasGmailOAuthSession } from '../gmailOAuthService';
import { listGmailDraftQueue } from '../gmailDraftService';
import { validateSafeRelativePath } from '../security';

type EmailMeta = {
    runId?: string;
    traceId?: string;
    stepId?: string;
};

type EmailSendArgs = {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
    replyTo?: string;
    fromName?: string;
    mode?: string;
    __meta?: EmailMeta;
};

type EmailInboxArgs = {
    sourcePath?: string;
    mode?: string;
    limit?: string | number;
    includeBody?: boolean;
    outputVar?: string;
    outputVarStatusCode?: string;
    outputVarStatusText?: string;
    outputVarData?: string;
    __meta?: EmailMeta;
};

type EmailSendResult = {
    content: string;
    status: number;
    statusText: string;
    data: any;
};

type EmailInboxItem = {
    id: string;
    source: 'workspace_file' | 'gmail_draft_queue';
    from?: string;
    to?: string[];
    subject?: string;
    snippet?: string;
    body?: string;
    receivedAt?: string;
    threadId?: string;
    labels?: string[];
    status?: string;
};

type EmailInboxResult = EmailSendResult;

function emitEmailStepLog(meta: EmailMeta | undefined, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
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

function parseRecipients(raw: any): string[] {
    const text = String(raw ?? '').trim();
    if (!text) {
        return [];
    }
    return text
        .split(/[\n,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeEmailMode(raw: any): 'auto' | 'gmail_draft' | 'preview' {
    const value = String(raw ?? 'auto').trim().toLowerCase();
    if (value === 'gmail_draft' || value === 'preview') {
        return value;
    }
    return 'auto';
}

function normalizeEmailText(raw: any, label: string): string {
    const value = String(raw ?? '').trim();
    if (!value) {
        throw new Error(`email.send requires "${label}".`);
    }
    return value;
}

function normalizeInboxMode(raw: any): 'auto' | 'file' | 'gmail_drafts' {
    const value = String(raw ?? 'auto').trim().toLowerCase();
    if (value === 'file' || value === 'gmail_drafts') {
        return value;
    }
    return 'auto';
}

function resolveInboxSourceCandidates(rawPath: any): string[] {
    const workspaceRoot = resolveWorkspaceRoot();
    const raw = String(rawPath || '').trim();
    const baseCandidates: string[] = [];

    if (!raw) {
        baseCandidates.push(path.join(workspaceRoot, 'leion-roots.email.inbox.json'));
        baseCandidates.push(path.join(workspaceRoot, 'leion-roots.email.inbox.jsonl'));
    } else {
        const candidate = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(workspaceRoot, raw);
        validateSafeRelativePath(candidate, workspaceRoot, workspaceRoot);
        baseCandidates.push(candidate);
        if (candidate.endsWith('.json')) {
            baseCandidates.push(candidate.replace(/\.json$/i, '.jsonl'));
        } else if (candidate.endsWith('.jsonl')) {
            baseCandidates.push(candidate.replace(/\.jsonl$/i, '.json'));
        } else {
            baseCandidates.push(`${candidate}.json`);
            baseCandidates.push(`${candidate}.jsonl`);
        }
    }

    return Array.from(new Set(baseCandidates));
}

function parseInboxItem(raw: any, index: number, source: EmailInboxItem['source']): EmailInboxItem {
    const entry = raw && typeof raw === 'object' ? raw : {};
    const recipients = Array.isArray(entry.to)
        ? entry.to.map((item: any) => String(item ?? '').trim()).filter(Boolean)
        : parseRecipients(entry.to);
    return {
        id: String(entry.id || entry.messageId || entry.threadId || `${source}-${index + 1}`),
        source,
        from: String(entry.from || entry.sender || '').trim() || undefined,
        to: recipients.length > 0 ? recipients : undefined,
        subject: String(entry.subject || '').trim() || undefined,
        snippet: String(entry.snippet || entry.preview || '').trim() || undefined,
        body: String(entry.body || '').trim() || undefined,
        receivedAt: String(entry.receivedAt || entry.timestamp || entry.date || '').trim() || undefined,
        threadId: String(entry.threadId || '').trim() || undefined,
        labels: Array.isArray(entry.labels)
            ? entry.labels.map((label: any) => String(label ?? '').trim()).filter(Boolean)
            : undefined,
        status: String(entry.status || '').trim() || undefined
    };
}

function parseInboxSource(text: string, filePath: string): EmailInboxItem[] {
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
                    return parseInboxItem(JSON.parse(line), index, 'workspace_file');
                } catch {
                    return parseInboxItem({ id: `line-${index + 1}`, snippet: line }, index, 'workspace_file');
                }
            });
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.map((entry, index) => parseInboxItem(entry, index, 'workspace_file'));
        }
        if (parsed && typeof parsed === 'object') {
            const items = Array.isArray((parsed as any).items)
                ? (parsed as any).items
                : Array.isArray((parsed as any).messages)
                    ? (parsed as any).messages
                    : Array.isArray((parsed as any).entries)
                        ? (parsed as any).entries
                        : [];
            if (items.length > 0) {
                return items.map((entry: any, index: number) => parseInboxItem(entry, index, 'workspace_file'));
            }
            return [parseInboxItem(parsed, 0, 'workspace_file')];
        }
    } catch {
        // fall through to line-based parsing
    }

    return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => parseInboxItem({ id: `line-${index + 1}`, snippet: line }, index, 'workspace_file'));
}

function readInboxFile(filePath: string): EmailInboxItem[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
        return [];
    }
    return parseInboxSource(content, filePath);
}

function mapGmailDraftQueueToInboxItems(entries: Array<{ id: string; threadId?: string; to: string; subject: string; bodyPreview: string }>): EmailInboxItem[] {
    return entries.map((entry, index) => ({
        id: String(entry.id || `gmail-draft-${index + 1}`),
        source: 'gmail_draft_queue',
        to: parseRecipients(entry.to),
        subject: String(entry.subject || '').trim() || undefined,
        snippet: String(entry.bodyPreview || '').trim() || undefined,
        threadId: String(entry.threadId || '').trim() || undefined,
        status: 'drafted'
    }));
}

function buildPreviewPayload(args: EmailSendArgs, toValue: string, subjectValue: string, bodyValue: string): Record<string, any> {
    const to = parseRecipients(toValue);
    const cc = parseRecipients(args?.cc);
    const bcc = parseRecipients(args?.bcc);
    return {
        deliveryMode: 'preview',
        provider: 'email',
        transport: 'preview',
        to,
        cc,
        bcc,
        replyTo: String(args?.replyTo || '').trim() || undefined,
        fromName: String(args?.fromName || '').trim() || undefined,
        subject: subjectValue,
        body: bodyValue,
        sentAt: new Date().toISOString(),
        note: 'No Gmail OAuth session was available. This is a deterministic preview only.'
    };
}

async function sendViaGmailDraft(context: vscode.ExtensionContext, args: EmailSendArgs): Promise<EmailSendResult> {
    const to = normalizeEmailText(args?.to, 'to');
    const subject = normalizeEmailText(args?.subject, 'subject');
    const body = normalizeEmailText(args?.body, 'body');

    emitEmailStepLog(args?.__meta, `[email.send] Gmail draft path selected for ${to}`);

    const draft = await createGmailDraft(context, {
        to,
        subject,
        body
    });

    const data = {
        deliveryMode: 'gmail_draft',
        provider: 'gmail',
        transport: 'gmail_draft',
        to,
        subject,
        body,
        draftId: draft.id || draft.message?.id,
        threadId: draft.message?.threadId,
        createdAt: new Date().toISOString(),
        draft
    };

    emitEmailStepLog(args?.__meta, `[email.send] Gmail draft created${data.draftId ? `: ${data.draftId}` : ''}`);

    return {
        content: JSON.stringify(data, null, 2),
        status: 201,
        statusText: 'Created',
        data
    };
}

function buildPreviewResult(args: EmailSendArgs): EmailSendResult {
    const to = normalizeEmailText(args?.to, 'to');
    const subject = normalizeEmailText(args?.subject, 'subject');
    const body = normalizeEmailText(args?.body, 'body');
    const data = buildPreviewPayload(args, to, subject, body);
    emitEmailStepLog(args?.__meta, `[email.send] Preview generated for ${data.to.length ? data.to.join(', ') : '(no recipients)'}`);
    return {
        content: JSON.stringify(data, null, 2),
        status: 202,
        statusText: 'Accepted',
        data
    };
}

function buildInboxResult(items: EmailInboxItem[], sourceLabel: string, sourcePath?: string): EmailInboxResult {
    const payload = {
        source: sourceLabel,
        sourcePath: sourcePath || undefined,
        itemCount: items.length,
        items,
        retrievedAt: new Date().toISOString()
    };
    return {
        content: JSON.stringify(payload, null, 2),
        status: 200,
        statusText: 'OK',
        data: payload
    };
}

export async function executeEmailInboxCommand(context: vscode.ExtensionContext, args: EmailInboxArgs): Promise<EmailInboxResult> {
    const mode = normalizeInboxMode(args?.mode);
    const limitRaw = Number(args?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 20;
    const includeBody = args?.includeBody === true;
    const candidates = resolveInboxSourceCandidates(args?.sourcePath);

    emitEmailStepLog(args?.__meta, `[email.inbox] mode=${mode} limit=${limit}`);

    if (mode !== 'gmail_drafts') {
        for (const candidate of candidates) {
            if (!fs.existsSync(candidate)) {
                continue;
            }
            emitEmailStepLog(args?.__meta, `[email.inbox] reading file ${candidate}`);
            const items = readInboxFile(candidate).slice(0, limit).map((item) => ({
                ...item,
                body: includeBody ? item.body : undefined
            }));
            emitEmailStepLog(args?.__meta, `[email.inbox] items=${items.length}`);
            return buildInboxResult(items, 'workspace_file', candidate);
        }
        if (mode === 'file') {
            emitEmailStepLog(args?.__meta, '[email.inbox] no inbox file found', 'stderr');
            return buildInboxResult([], 'workspace_file');
        }
    }

    const hasGmailSession = await hasGmailOAuthSession(context);
    if (hasGmailSession) {
        emitEmailStepLog(args?.__meta, '[email.inbox] falling back to Gmail draft queue');
        const queue = await listGmailDraftQueue(context, limit);
        const items = mapGmailDraftQueueToInboxItems(queue).slice(0, limit);
        emitEmailStepLog(args?.__meta, `[email.inbox] items=${items.length}`);
        return buildInboxResult(items, 'gmail_draft_queue');
    }

    emitEmailStepLog(args?.__meta, '[email.inbox] no inbox source available', 'stderr');
    return buildInboxResult([], 'empty');
}

export function registerEmailProvider(context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'email',
        type: 'vscode',
        capabilities: [
            {
                capability: 'email.send',
                command: 'intentRouter.internal.emailSend',
                description: 'Send email using a Gmail draft-first workflow or a deterministic preview fallback',
                determinism: 'deterministic',
                args: [
                    { name: 'to', type: 'string', description: 'Recipient email address or CSV list', required: true },
                    { name: 'subject', type: 'string', description: 'Email subject', required: true },
                    { name: 'body', type: 'string', description: 'Email body', required: true },
                    { name: 'cc', type: 'string', description: 'Optional CC recipients' },
                    { name: 'bcc', type: 'string', description: 'Optional BCC recipients' },
                    { name: 'replyTo', type: 'string', description: 'Optional reply-to address' },
                    { name: 'fromName', type: 'string', description: 'Optional display name' },
                    { name: 'mode', type: 'enum', options: ['auto', 'gmail_draft', 'preview'], description: 'Delivery mode', default: 'auto' }
                ]
            },
            {
                capability: 'email.inbox',
                command: 'intentRouter.internal.emailInbox',
                description: 'Read a local inbox file or fall back to Gmail draft queue items',
                determinism: 'deterministic',
                args: [
                    { name: 'sourcePath', type: 'path', description: 'Inbox file path inside the workspace', default: 'leion-roots.email.inbox.json' },
                    { name: 'mode', type: 'enum', options: ['auto', 'file', 'gmail_drafts'], description: 'Inbox source mode', default: 'auto' },
                    { name: 'limit', type: 'string', description: 'Maximum number of items to return', default: '20' },
                    { name: 'includeBody', type: 'boolean', description: 'Include bodies from file-backed inbox entries', default: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the inbox response' }
                ]
            }
        ]
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.emailSend', async (args: EmailSendArgs) => {
            return await executeEmailSendCommand(context, args);
        }),
        vscode.commands.registerCommand('intentRouter.internal.emailInbox', async (args: EmailInboxArgs) => {
            return await executeEmailInboxCommand(context, args);
        })
    );
}

export async function executeEmailSendCommand(context: vscode.ExtensionContext, args: EmailSendArgs): Promise<EmailSendResult> {
    const mode = normalizeEmailMode(args?.mode);
    const hasGmailSession = await hasGmailOAuthSession(context);
    normalizeEmailText(args?.to, 'to');
    normalizeEmailText(args?.subject, 'subject');
    normalizeEmailText(args?.body, 'body');

    if (mode === 'preview' || (!hasGmailSession && mode === 'auto')) {
        return buildPreviewResult(args);
    }

    if (!hasGmailSession) {
        throw new Error('email.send requires a connected Gmail session for gmail_draft mode.');
    }

    return sendViaGmailDraft(context, args);
}

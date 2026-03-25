import * as https from 'https';
import * as vscode from 'vscode';
import { getValidGmailSession } from './gmailOAuthService';

type GmailDraftInput = {
    to: string;
    subject: string;
    body: string;
};

type GmailDraftResponse = {
    id?: string;
    message?: {
        id?: string;
        threadId?: string;
    };
};

type GmailDraftListResponse = {
    drafts?: Array<{
        id?: string;
        message?: {
            id?: string;
            threadId?: string;
        };
    }>;
};

type GmailDraftDetailResponse = {
    id?: string;
    message?: {
        threadId?: string;
        snippet?: string;
        payload?: {
            headers?: Array<{
                name?: string;
                value?: string;
            }>;
        };
    };
};

export type GmailDraftQueueEntry = {
    id: string;
    draftId?: string;
    threadId?: string;
    to: string;
    subject: string;
    bodyPreview: string;
};

function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function jsonRequest<T>(urlString: string, accessToken: string, body: string): Promise<T> {
    const url = new URL(urlString);
    return new Promise<T>((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body).toString()
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
                        resolve(JSON.parse(raw) as T);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );
        request.on('error', reject);
        request.write(body);
        request.end();
    });
}

function getJson<T>(urlString: string, accessToken: string): Promise<T> {
    const url = new URL(urlString);
    return new Promise<T>((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`
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
                        resolve(JSON.parse(raw) as T);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );
        request.on('error', reject);
        request.end();
    });
}

function buildRawEmail(input: GmailDraftInput): string {
    return [
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        input.body
    ].join('\r\n');
}

export async function createGmailDraft(context: vscode.ExtensionContext, input: GmailDraftInput): Promise<GmailDraftResponse> {
    const session = await getValidGmailSession(context);
    if (!session.accessToken) {
        throw new Error('Gmail is not connected. Connect Email / Gmail first.');
    }
    const accessToken = session.accessToken;
    const raw = buildRawEmail(input);
    return jsonRequest<GmailDraftResponse>(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        accessToken,
        JSON.stringify({
            message: {
                raw: base64UrlEncode(raw)
            }
        })
    );
}

function headerValue(detail: GmailDraftDetailResponse, name: string): string {
    const header = detail.message?.payload?.headers?.find((entry) => String(entry?.name || '').toLowerCase() === name.toLowerCase());
    return String(header?.value || '').trim();
}

export async function listGmailDraftQueue(context: vscode.ExtensionContext, maxResults = 10): Promise<GmailDraftQueueEntry[]> {
    const session = await getValidGmailSession(context);
    if (!session.accessToken) {
        throw new Error('Gmail is not connected. Connect Email / Gmail first.');
    }
    const accessToken = session.accessToken;

    const list = await getJson<GmailDraftListResponse>(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=${Math.max(1, Math.min(maxResults, 20))}`,
        accessToken
    );
    const drafts = Array.isArray(list.drafts) ? list.drafts : [];
    const entries: Array<GmailDraftQueueEntry | null> = await Promise.all(
        drafts.map(async (draft): Promise<GmailDraftQueueEntry | null> => {
            if (!draft.id) {
                return null;
            }
            const detail = await getJson<GmailDraftDetailResponse>(
                `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draft.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To`,
                accessToken
            );
            const entry: GmailDraftQueueEntry = {
                id: draft.id,
                draftId: draft.id || undefined,
                threadId: detail.message?.threadId || draft.message?.threadId,
                to: headerValue(detail, 'To'),
                subject: headerValue(detail, 'Subject'),
                bodyPreview: String(detail.message?.snippet || '').trim()
            };
            return entry;
        })
    );

    return entries.filter((entry): entry is GmailDraftQueueEntry => entry !== null);
}

export async function openGmailDrafts(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse('https://mail.google.com/mail/u/0/#drafts'));
}

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
    const raw = buildRawEmail(input);
    return jsonRequest<GmailDraftResponse>(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        session.accessToken,
        JSON.stringify({
            message: {
                raw: base64UrlEncode(raw)
            }
        })
    );
}

export async function openGmailDrafts(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse('https://mail.google.com/mail/u/0/#drafts'));
}

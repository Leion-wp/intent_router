import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import { SalesProviderAccount } from './salesCockpitStore';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALLBACK_PATH = '/oauth/google/callback';
const GOOGLE_SECRET_PREFIX = 'leionRoots.salesProvider.google_sheets';

export const GOOGLE_WORKSPACE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
] as const;

export const GOOGLE_WORKSPACE_SECRET_KEYS = [
    'clientId',
    'clientSecret',
    'accessToken',
    'refreshToken',
    'scope',
    'tokenType',
    'expiresAt',
    'idToken',
    'accountEmail'
] as const;

type GoogleTokenResponse = {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
};

type GoogleUserProfile = {
    email?: string;
    name?: string;
    picture?: string;
};

type GoogleSession = {
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    scope?: string;
    tokenType?: string;
    expiresAt?: string;
    idToken?: string;
    accountEmail?: string;
};

function googleSecretKey(key: typeof GOOGLE_WORKSPACE_SECRET_KEYS[number]): string {
    return `${GOOGLE_SECRET_PREFIX}.${key}`;
}

async function getSecret(context: vscode.ExtensionContext, key: typeof GOOGLE_WORKSPACE_SECRET_KEYS[number]): Promise<string | undefined> {
    return context.secrets.get(googleSecretKey(key));
}

async function setSecret(context: vscode.ExtensionContext, key: typeof GOOGLE_WORKSPACE_SECRET_KEYS[number], value: string | undefined): Promise<void> {
    if (!value) {
        await context.secrets.delete(googleSecretKey(key));
        return;
    }
    await context.secrets.store(googleSecretKey(key), value);
}

async function readSession(context: vscode.ExtensionContext): Promise<GoogleSession> {
    const entries = await Promise.all(
        GOOGLE_WORKSPACE_SECRET_KEYS.map(async (key) => [key, await getSecret(context, key)] as const)
    );
    return Object.fromEntries(entries) as GoogleSession;
}

export async function readGoogleWorkspaceClientCredentials(context: vscode.ExtensionContext): Promise<{
    clientId?: string;
    clientSecret?: string;
    accountEmail?: string;
}> {
    const session = await readSession(context);
    return {
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        accountEmail: session.accountEmail
    };
}

async function writeSession(context: vscode.ExtensionContext, session: Partial<GoogleSession>): Promise<void> {
    await Promise.all(
        (Object.entries(session) as Array<[keyof GoogleSession, string | undefined]>).map(([key, value]) =>
            setSecret(context, key as typeof GOOGLE_WORKSPACE_SECRET_KEYS[number], value)
        )
    );
}

function base64UrlEncode(input: Buffer): string {
    return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sha256(input: string): Buffer {
    return crypto.createHash('sha256').update(input).digest();
}

function encodeJwtSegment(input: string): string {
    return base64UrlEncode(Buffer.from(input, 'utf8'));
}

export function decodeGoogleJwtClaims(token: string): Record<string, any> {
    const parts = String(token || '').split('.');
    if (parts.length < 2) {
        throw new Error('Invalid JWT payload.');
    }
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(payload);
}

export function describeGoogleScopes(scopeValue: string | readonly string[] | undefined): string[] {
    const scopes = Array.isArray(scopeValue)
        ? scopeValue
        : String(scopeValue || '')
            .split(/\s+/)
            .map((entry) => entry.trim())
            .filter(Boolean);

    const labels = scopes.map((scope) => {
        if (scope === 'openid') return 'OpenID';
        if (scope === 'email') return 'Google account email';
        if (scope === 'profile') return 'Google profile';
        if (scope === 'https://www.googleapis.com/auth/spreadsheets') return 'Google Sheets';
        if (scope === 'https://www.googleapis.com/auth/drive.file') return 'Google Drive (file-level)';
        return scope;
    });

    return Array.from(new Set(labels));
}

export function mergeGoogleManagedNotes(existingNotes: string | undefined, scopeValue: string | readonly string[] | undefined): string {
    const prefix = '[Google OAuth]';
    const cleaned = String(existingNotes || '').split(prefix)[0].trim();
    const scopeLabels = describeGoogleScopes(scopeValue);
    const managed = [
        prefix,
        'Flow: desktop OAuth with loopback callback and PKCE.',
        `Scopes: ${scopeLabels.length > 0 ? scopeLabels.join(', ') : 'pending scope grant'}.`,
        'Surface: Google Sheets and Drive first. Gmail comes next as a separate connector.'
    ].join('\n');
    return cleaned ? `${cleaned}\n\n${managed}` : managed;
}

export function buildGoogleAuthorizationUrl(clientId: string, redirectUri: string, codeChallenge: string, scopes: readonly string[]): string {
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
}

function jsonRequest<T>(urlString: string, options: https.RequestOptions & { method: 'GET' | 'POST' }, body?: string): Promise<T> {
    const url = new URL(urlString);
    return new Promise<T>((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || undefined,
                path: `${url.pathname}${url.search}`,
                method: options.method,
                headers: options.headers
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
        if (body) {
            request.write(body);
        }
        request.end();
    });
}

async function exchangeCodeForTokens(input: {
    clientId: string;
    clientSecret?: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri
    });
    if (input.clientSecret) {
        body.set('client_secret', input.clientSecret);
    }
    return jsonRequest<GoogleTokenResponse>(
        GOOGLE_TOKEN_ENDPOINT,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body.toString()).toString()
            }
        },
        body.toString()
    );
}

async function refreshAccessToken(input: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
}): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
        client_id: input.clientId,
        refresh_token: input.refreshToken,
        grant_type: 'refresh_token'
    });
    if (input.clientSecret) {
        body.set('client_secret', input.clientSecret);
    }
    return jsonRequest<GoogleTokenResponse>(
        GOOGLE_TOKEN_ENDPOINT,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body.toString()).toString()
            }
        },
        body.toString()
    );
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleUserProfile | undefined> {
    try {
        return await jsonRequest<GoogleUserProfile>(
            GOOGLE_USERINFO_ENDPOINT,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
    } catch {
        return undefined;
    }
}

async function startLoopbackServer(): Promise<{
    redirectUri: string;
    waitForCode: Promise<string>;
    dispose: () => Promise<void>;
}> {
    let resolver: ((code: string) => void) | undefined;
    let rejecter: ((error: Error) => void) | undefined;
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const waitForCode = new Promise<string>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });

    const server = http.createServer((request, response) => {
        const localAddress = server.address();
        const localPort = typeof localAddress === 'object' && localAddress ? localAddress.port : 0;
        const url = new URL(request.url || '/', `http://127.0.0.1:${localPort}`);

        if (url.pathname !== GOOGLE_CALLBACK_PATH) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found.');
            return;
        }

        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end([
            '<!doctype html>',
            '<html><body style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;">',
            `<h2>${error ? 'Google authorization failed' : 'Google authorization completed'}</h2>`,
            `<p>${error ? 'Return to VS Code and retry the connection.' : 'You can close this tab and return to VS Code.'}</p>`,
            '</body></html>'
        ].join(''));

        if (settled) {
            return;
        }
        settled = true;
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        if (error) {
            rejecter?.(new Error(`Google OAuth error: ${error}`));
        } else if (code) {
            resolver?.(code);
        } else {
            rejecter?.(new Error('Google OAuth callback did not contain an authorization code.'));
        }
        setTimeout(() => server.close(), 25);
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.on('error', reject);
    });

    timeoutHandle = setTimeout(() => {
        if (settled) {
            return;
        }
        settled = true;
        rejecter?.(new Error('Timed out waiting for Google authorization. Finish the login within 2 minutes and retry.'));
        server.close();
    }, 120000);

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    return {
        redirectUri: `http://127.0.0.1:${port}${GOOGLE_CALLBACK_PATH}`,
        waitForCode,
        dispose: async () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    };
}

async function promptGoogleClientId(context: vscode.ExtensionContext): Promise<{ clientId?: string; clientSecret?: string }> {
    const current = await readSession(context);
    const clientId = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt: 'Google OAuth Desktop Client ID',
        value: current.clientId || '',
        placeHolder: 'xxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com'
    });
    if (clientId === undefined) {
        return {};
    }

    const clientSecret = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt: 'Google OAuth client secret (optional for desktop PKCE)',
        password: true,
        value: current.clientSecret || '',
        placeHolder: 'Leave empty if your desktop client works without it'
    });
    if (clientSecret === undefined) {
        return {};
    }

    return {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
    };
}

function computeExpiry(expiresIn: number | undefined): string | undefined {
    if (!expiresIn || !Number.isFinite(expiresIn)) {
        return undefined;
    }
    return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function isExpired(expiresAt: string | undefined): boolean {
    if (!expiresAt) {
        return true;
    }
    return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

async function ensureAccessToken(context: vscode.ExtensionContext): Promise<GoogleSession> {
    const session = await readSession(context);
    if (!session.clientId) {
        throw new Error('Google client ID is not configured yet.');
    }

    if (session.accessToken && !isExpired(session.expiresAt)) {
        return session;
    }

    if (!session.refreshToken) {
        return session;
    }

    const refreshed = await refreshAccessToken({
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        refreshToken: session.refreshToken
    });

    if (!refreshed.access_token) {
        throw new Error(refreshed.error_description || refreshed.error || 'Google token refresh failed.');
    }

    const next: GoogleSession = {
        ...session,
        accessToken: refreshed.access_token,
        tokenType: refreshed.token_type || session.tokenType || 'Bearer',
        scope: refreshed.scope || session.scope,
        expiresAt: computeExpiry(refreshed.expires_in),
        idToken: refreshed.id_token || session.idToken
    };

    let accountEmail = session.accountEmail;
    if (!accountEmail && next.idToken) {
        try {
            accountEmail = String(decodeGoogleJwtClaims(next.idToken).email || '').trim() || accountEmail;
        } catch {
            accountEmail = session.accountEmail;
        }
    }
    if (!accountEmail && next.accessToken) {
        accountEmail = (await fetchGoogleProfile(next.accessToken))?.email || accountEmail;
    }
    next.accountEmail = accountEmail;

    await writeSession(context, next);
    return next;
}

export async function getValidGoogleWorkspaceSession(context: vscode.ExtensionContext): Promise<{
    accessToken?: string;
    accountEmail?: string;
    scope?: string;
}> {
    const session = await ensureAccessToken(context);
    return {
        accessToken: session.accessToken,
        accountEmail: session.accountEmail,
        scope: session.scope
    };
}

export async function connectGoogleWorkspace(context: vscode.ExtensionContext, current: SalesProviderAccount): Promise<Partial<SalesProviderAccount> | undefined> {
    const credentials = await promptGoogleClientId(context);
    const clientId = credentials.clientId;
    if (!clientId) {
        return undefined;
    }

    const consent = await vscode.window.showInformationMessage(
        'Leion Cockpit will open Google sign-in for Google Sheets and Drive file access.',
        { modal: true },
        'Continue'
    );
    if (consent !== 'Continue') {
        return undefined;
    }

    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(sha256(verifier));
    const callbackServer = await startLoopbackServer();

    try {
        const authUrl = buildGoogleAuthorizationUrl(clientId, callbackServer.redirectUri, challenge, GOOGLE_WORKSPACE_SCOPES);
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        const code = await callbackServer.waitForCode;
        const tokens = await exchangeCodeForTokens({
            clientId,
            clientSecret: credentials.clientSecret,
            code,
            codeVerifier: verifier,
            redirectUri: callbackServer.redirectUri
        });

        if (!tokens.access_token) {
            throw new Error(tokens.error_description || tokens.error || 'Google did not return an access token.');
        }

        let accountEmail = '';
        if (tokens.id_token) {
            try {
                accountEmail = String(decodeGoogleJwtClaims(tokens.id_token).email || '').trim();
            } catch {
                accountEmail = '';
            }
        }
        if (!accountEmail) {
            accountEmail = String((await fetchGoogleProfile(tokens.access_token))?.email || '').trim();
        }

        await writeSession(context, {
            clientId,
            clientSecret: credentials.clientSecret,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            scope: tokens.scope || GOOGLE_WORKSPACE_SCOPES.join(' '),
            tokenType: tokens.token_type || 'Bearer',
            expiresAt: computeExpiry(tokens.expires_in),
            idToken: tokens.id_token,
            accountEmail
        });

        return {
            label: 'Google Workspace',
            accountRef: accountEmail || current.accountRef || '',
            endpointUrl: current.endpointUrl || '',
            notes: mergeGoogleManagedNotes(current.notes, tokens.scope || GOOGLE_WORKSPACE_SCOPES),
            status: 'connected',
            mode: current.mode || 'sync_only',
            capabilities: ['oauth connect', 'sheet sync', 'drive proof locker'],
            lastValidatedAt: new Date().toISOString()
        };
    } finally {
        await callbackServer.dispose();
    }
}

export async function validateGoogleWorkspace(context: vscode.ExtensionContext, current: SalesProviderAccount): Promise<Partial<SalesProviderAccount>> {
    const session = await ensureAccessToken(context);
    const hasSession = !!session.clientId && (!!session.accessToken || !!session.refreshToken);
    const status = hasSession ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected';

    return {
        label: 'Google Workspace',
        accountRef: session.accountEmail || current.accountRef || '',
        endpointUrl: current.endpointUrl || '',
        notes: mergeGoogleManagedNotes(current.notes, session.scope || GOOGLE_WORKSPACE_SCOPES),
        status,
        capabilities: ['oauth connect', 'sheet sync', 'drive proof locker'],
        lastValidatedAt: new Date().toISOString()
    };
}

export async function disconnectGoogleWorkspace(context: vscode.ExtensionContext): Promise<void> {
    await Promise.all(GOOGLE_WORKSPACE_SECRET_KEYS.map((key) => setSecret(context, key, undefined)));
}

export function createMockGoogleIdToken(email: string): string {
    return [
        encodeJwtSegment(JSON.stringify({ alg: 'none', typ: 'JWT' })),
        encodeJwtSegment(JSON.stringify({ email })),
        ''
    ].join('.');
}

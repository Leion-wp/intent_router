import * as vscode from 'vscode';
import {
    createDefaultSalesCockpitState,
    readSalesCockpitFromWorkspace,
    SalesCockpitState,
    SalesProviderAccount,
    SalesProviderId,
    writeSalesCockpitToWorkspace
} from './salesCockpitStore';
import {
    connectGoogleWorkspace,
    describeGoogleScopes,
    disconnectGoogleWorkspace,
    GOOGLE_WORKSPACE_SECRET_KEYS,
    validateGoogleWorkspace
} from './googleOAuthService';
import {
    connectGmailProvider,
    describeGmailScopes,
    disconnectGmailProvider,
    GMAIL_OAUTH_SECRET_KEYS,
    hasGmailOAuthSession,
    validateGmailProvider
} from './gmailOAuthService';

const SECRET_PREFIX = 'leionRoots.salesProvider';

const PROVIDER_SECRET_KEYS: Record<SalesProviderId, string[]> = {
    email: ['smtpPassword', 'smtpUsername', ...GMAIL_OAUTH_SECRET_KEYS],
    google_sheets: [...GOOGLE_WORKSPACE_SECRET_KEYS],
    crm: ['apiToken'],
    linkedin: [],
    reddit: [],
    product_hunt: []
};

function providerSecretKey(providerId: SalesProviderId, key: string): string {
    return `${SECRET_PREFIX}.${providerId}.${key}`;
}

function getProvider(state: SalesCockpitState, providerId: SalesProviderId): SalesProviderAccount {
    const current = state.providerAccounts.find((provider) => provider.id === providerId || provider.provider === providerId);
    if (current) {
        return current;
    }
    return createDefaultSalesCockpitState().providerAccounts.find((provider) => provider.id === providerId)!;
}

function updateProvider(state: SalesCockpitState, providerId: SalesProviderId, patch: Partial<SalesProviderAccount>): SalesCockpitState {
    return {
        ...state,
        providerAccounts: state.providerAccounts.map((provider) => {
            if (provider.id !== providerId && provider.provider !== providerId) {
                return provider;
            }
            return {
                ...provider,
                ...patch
            };
        })
    };
}

function providerLog(level: 'info' | 'success' | 'warning' | 'error', message: string, detail?: string) {
    return {
        id: `${Date.now()}-${level}-${message.slice(0, 24).replace(/[^a-z0-9]+/gi, '-')}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        detail
    };
}

function withProviderLog(provider: SalesProviderAccount, entry: ReturnType<typeof providerLog>): Partial<SalesProviderAccount> {
    const nextLogs = [entry, ...(provider.logs || [])].slice(0, 12);
    return {
        logs: nextLogs
    };
}

async function promptValue(options: vscode.InputBoxOptions): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        ...options
    });
    if (value === undefined) {
        return undefined;
    }
    return value.trim();
}

async function promptMode(current: SalesProviderAccount): Promise<SalesProviderAccount['mode'] | undefined> {
    const picked = await vscode.window.showQuickPick(
        [
            { label: 'Draft Only', description: 'Prepare copy and review manually', value: 'draft_only' },
            { label: 'Manual Handoff', description: 'Open the provider surface and hand off manually', value: 'manual_handoff' },
            { label: 'Sync Only', description: 'Keep data in sync without sending content', value: 'sync_only' }
        ],
        {
            ignoreFocusOut: true,
            placeHolder: `Mode for ${current.label}`
        }
    );
    return picked?.value as SalesProviderAccount['mode'] | undefined;
}

async function promptEmailConnectionStrategy(): Promise<'gmail_oauth' | 'smtp' | undefined> {
    const picked = await vscode.window.showQuickPick(
        [
            { label: 'Gmail OAuth', description: 'Recommended. Reuse the Google desktop OAuth app and keep drafts/manual send.', value: 'gmail_oauth' },
            { label: 'SMTP / App Password', description: 'Fallback for non-Gmail inboxes or app-password based sending.', value: 'smtp' }
        ],
        {
            ignoreFocusOut: true,
            placeHolder: 'How do you want to connect the email surface?'
        }
    );
    return picked?.value as 'gmail_oauth' | 'smtp' | undefined;
}

async function storeSecret(context: vscode.ExtensionContext, providerId: SalesProviderId, key: string, value: string | undefined): Promise<void> {
    if (!value) {
        await context.secrets.delete(providerSecretKey(providerId, key));
        return;
    }
    await context.secrets.store(providerSecretKey(providerId, key), value);
}

async function hasSecret(context: vscode.ExtensionContext, providerId: SalesProviderId, key: string): Promise<boolean> {
    const value = await context.secrets.get(providerSecretKey(providerId, key));
    return typeof value === 'string' && value.length > 0;
}

async function connectEmail(context: vscode.ExtensionContext, state: SalesCockpitState): Promise<SalesCockpitState | undefined> {
    const current = getProvider(state, 'email');
    const accountRef = await promptValue({
        prompt: 'Email address to use in the cockpit',
        value: current.accountRef || '',
        placeHolder: 'founder@company.com'
    });
    if (accountRef === undefined) return undefined;

    const host = await promptValue({
        prompt: 'SMTP host',
        value: current.endpointUrl?.replace(/^smtp:\/\//, '').split(':')[0] || '',
        placeHolder: 'smtp.gmail.com'
    });
    if (host === undefined) return undefined;

    const port = await promptValue({
        prompt: 'SMTP port',
        value: current.endpointUrl?.split(':').pop() || '587',
        placeHolder: '587'
    });
    if (port === undefined) return undefined;

    const username = await promptValue({
        prompt: 'SMTP username',
        value: current.accountRef || accountRef,
        placeHolder: accountRef || 'founder@company.com'
    });
    if (username === undefined) return undefined;

    const password = await promptValue({
        prompt: 'SMTP password or app password',
        password: true,
        placeHolder: 'Stored in VS Code Secret Storage'
    });
    if (password === undefined) return undefined;

    const mode = await promptMode(current);
    if (!mode) return undefined;

    await storeSecret(context, 'email', 'smtpUsername', username);
    await storeSecret(context, 'email', 'smtpPassword', password);

    return updateProvider(state, 'email', {
        accountRef,
        endpointUrl: `smtp://${host}:${port || '587'}`,
        mode,
        status: password ? 'connected' : 'configured',
        health: password ? 'healthy' : 'warning',
        scopes: ['SMTP credentials'],
        lastValidatedAt: new Date().toISOString(),
        lastValidationMessage: password ? 'SMTP credentials stored.' : 'SMTP surface configured but not fully connected.',
        ...withProviderLog(current, providerLog(password ? 'success' : 'warning', 'SMTP connection updated.', `Host: ${host}:${port || '587'}`))
    });
}

async function connectTokenProvider(
    context: vscode.ExtensionContext,
    state: SalesCockpitState,
    providerId: 'crm',
    prompts: {
        accountPrompt: string;
        accountPlaceholder: string;
        endpointPrompt: string;
        endpointPlaceholder: string;
        secretPrompt: string;
    }
): Promise<SalesCockpitState | undefined> {
    const current = getProvider(state, providerId);
    const accountRef = await promptValue({
        prompt: prompts.accountPrompt,
        value: current.accountRef || '',
        placeHolder: prompts.accountPlaceholder
    });
    if (accountRef === undefined) return undefined;

    const endpointUrl = await promptValue({
        prompt: prompts.endpointPrompt,
        value: current.endpointUrl || '',
        placeHolder: prompts.endpointPlaceholder
    });
    if (endpointUrl === undefined) return undefined;

    const secret = await promptValue({
        prompt: prompts.secretPrompt,
        password: true,
        placeHolder: 'Stored in VS Code Secret Storage'
    });
    if (secret === undefined) return undefined;

    await storeSecret(context, providerId, 'apiToken', secret);

    return updateProvider(state, providerId, {
        accountRef,
        endpointUrl,
        status: secret ? 'connected' : 'configured',
        health: secret ? 'healthy' : 'warning',
        scopes: ['API token'],
        lastValidatedAt: new Date().toISOString(),
        lastValidationMessage: secret ? 'Token stored and ready to validate against the CRM.' : 'CRM surface configured without token.',
        ...withProviderLog(current, providerLog(secret ? 'success' : 'warning', `${current.label} connection updated.`, endpointUrl))
    });
}

async function connectManualProvider(
    state: SalesCockpitState,
    providerId: 'linkedin' | 'reddit' | 'product_hunt',
    prompts: {
        accountPrompt: string;
        accountPlaceholder: string;
        endpointPrompt: string;
        endpointPlaceholder: string;
    }
): Promise<SalesCockpitState | undefined> {
    const current = getProvider(state, providerId);
    const accountRef = await promptValue({
        prompt: prompts.accountPrompt,
        value: current.accountRef || '',
        placeHolder: prompts.accountPlaceholder
    });
    if (accountRef === undefined) return undefined;

    const endpointUrl = await promptValue({
        prompt: prompts.endpointPrompt,
        value: current.endpointUrl || '',
        placeHolder: prompts.endpointPlaceholder
    });
    if (endpointUrl === undefined) return undefined;

    return updateProvider(state, providerId, {
        accountRef,
        endpointUrl,
        status: accountRef || endpointUrl ? 'configured' : 'not_connected',
        health: accountRef || endpointUrl ? 'warning' : 'unknown',
        scopes: [],
        lastValidatedAt: accountRef || endpointUrl ? new Date().toISOString() : undefined,
        lastValidationMessage: accountRef || endpointUrl ? 'Manual handoff surface configured.' : 'Manual handoff surface not configured yet.',
        ...withProviderLog(current, providerLog(accountRef || endpointUrl ? 'info' : 'warning', `${current.label} handoff surface updated.`, endpointUrl || accountRef))
    });
}

export async function connectSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState | undefined> {
    try {
        const state = await readSalesCockpitFromWorkspace();
        const current = getProvider(state, providerId);
        let next: SalesCockpitState | undefined;

        if (providerId === 'email') {
            const strategy = await promptEmailConnectionStrategy();
            if (strategy === 'gmail_oauth') {
                const patch = await connectGmailProvider(context, current);
                next = patch ? updateProvider(state, providerId, patch) : undefined;
            } else if (strategy === 'smtp') {
                next = await connectEmail(context, state);
            }
        } else if (providerId === 'google_sheets') {
            const patch = await connectGoogleWorkspace(context, current);
            next = patch ? updateProvider(state, providerId, patch) : undefined;
        } else if (providerId === 'crm') {
            next = await connectTokenProvider(context, state, 'crm', {
                accountPrompt: 'CRM workspace or account label',
                accountPlaceholder: 'HubSpot Workspace',
                endpointPrompt: 'CRM URL',
                endpointPlaceholder: 'https://app.hubspot.com/...',
                secretPrompt: 'CRM API token'
            });
        } else if (providerId === 'linkedin') {
            next = await connectManualProvider(state, 'linkedin', {
                accountPrompt: 'LinkedIn profile URL or handle',
                accountPlaceholder: 'https://www.linkedin.com/in/your-profile',
                endpointPrompt: 'LinkedIn queue or search URL',
                endpointPlaceholder: 'https://www.linkedin.com/sales/...'
            });
        } else if (providerId === 'reddit') {
            next = await connectManualProvider(state, 'reddit', {
                accountPrompt: 'Reddit account',
                accountPlaceholder: 'u/founder-handle',
                endpointPrompt: 'Subreddit or thread URL',
                endpointPlaceholder: 'https://www.reddit.com/r/startups'
            });
        } else if (providerId === 'product_hunt') {
            next = await connectManualProvider(state, 'product_hunt', {
                accountPrompt: 'Product Hunt maker profile',
                accountPlaceholder: 'https://www.producthunt.com/@your-handle',
                endpointPrompt: 'Launch or maker URL',
                endpointPlaceholder: 'https://www.producthunt.com/posts/...'
            });
        }

        if (!next) {
            return undefined;
        }

        const connectedState = updateProvider(next, providerId, {
            health: getProvider(next, providerId).status === 'connected' ? 'healthy' : 'warning',
            lastValidationMessage: getProvider(next, providerId).status === 'connected'
                ? `${getProvider(next, providerId).label} connected and ready.`
                : `${getProvider(next, providerId).label} configured but not fully connected.`,
            ...withProviderLog(
                getProvider(next, providerId),
                providerLog('success', `${getProvider(next, providerId).label} connected.`, getProvider(next, providerId).accountRef || getProvider(next, providerId).endpointUrl)
            )
        });
        const saved = await writeSalesCockpitToWorkspace(connectedState);
        vscode.window.showInformationMessage(`${getProvider(saved, providerId).label} connected in Leion Cockpit.`);
        return saved;
    } catch (error: any) {
        const state = await readSalesCockpitFromWorkspace();
        const current = getProvider(state, providerId);
        await writeSalesCockpitToWorkspace(updateProvider(state, providerId, {
            health: 'error',
            lastValidatedAt: new Date().toISOString(),
            lastValidationMessage: error?.message || String(error),
            ...withProviderLog(current, providerLog('error', `Failed to connect ${current.label}.`, error?.message || String(error)))
        }));
        vscode.window.showErrorMessage(`Failed to connect provider: ${error?.message || error}`);
        return undefined;
    }
}

export async function disconnectSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState> {
    const state = await readSalesCockpitFromWorkspace();
    const defaults = createDefaultSalesCockpitState();
    const fallback = defaults.providerAccounts.find((provider) => provider.id === providerId)!;

    if (providerId === 'google_sheets') {
        await disconnectGoogleWorkspace(context);
    } else if (providerId === 'email') {
        await disconnectGmailProvider(context);
        for (const key of ['smtpPassword', 'smtpUsername']) {
            await context.secrets.delete(providerSecretKey(providerId, key));
        }
    } else {
        for (const key of PROVIDER_SECRET_KEYS[providerId] || []) {
            await context.secrets.delete(providerSecretKey(providerId, key));
        }
    }

    const next = updateProvider(state, providerId, {
        ...fallback,
        lastValidatedAt: undefined,
        health: 'unknown',
        scopes: [],
        lastValidationMessage: 'Disconnected.',
        ...withProviderLog(getProvider(state, providerId), providerLog('info', `${fallback.label} disconnected.`))
    });
    const saved = await writeSalesCockpitToWorkspace(next);
    vscode.window.showInformationMessage(`${fallback.label} disconnected from Leion Cockpit.`);
    return saved;
}

export async function validateSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState> {
    try {
        const state = await readSalesCockpitFromWorkspace();
        const current = getProvider(state, providerId);

        let patch: Partial<SalesProviderAccount>;

        if (providerId === 'email') {
            if (await hasGmailOAuthSession(context)) {
                patch = await validateGmailProvider(context, current);
                patch.health = patch.status === 'connected' ? 'healthy' : 'warning';
                patch.scopes = patch.scopes || describeGmailScopes(current.notes);
                patch.lastValidationMessage = patch.status === 'connected'
                    ? 'Gmail OAuth session valid and ready for draft operations.'
                    : 'Gmail surface is partially configured.';
            } else {
                const hasPasswordSecret = await hasSecret(context, 'email', 'smtpPassword');
                patch = {
                    status: current.accountRef && current.endpointUrl && hasPasswordSecret ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected',
                    health: current.accountRef && current.endpointUrl && hasPasswordSecret ? 'healthy' : current.accountRef || current.endpointUrl ? 'warning' : 'unknown',
                    scopes: ['SMTP credentials'],
                    lastValidatedAt: new Date().toISOString(),
                    lastValidationMessage: hasPasswordSecret ? 'SMTP credentials present.' : 'Missing SMTP password secret.'
                };
            }
        } else if (providerId === 'google_sheets') {
            patch = await validateGoogleWorkspace(context, current);
            patch.health = patch.status === 'connected' ? 'healthy' : 'warning';
            patch.scopes = patch.scopes || describeGoogleScopes(current.notes);
            patch.lastValidationMessage = patch.status === 'connected'
                ? 'Google Workspace session valid for Sheets and Drive.'
                : 'Google Workspace connector is partially configured.';
        } else if (providerId === 'crm') {
            const hasToken = await hasSecret(context, 'crm', 'apiToken');
            patch = {
                status: current.accountRef && current.endpointUrl && hasToken ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected',
                health: current.accountRef && current.endpointUrl && hasToken ? 'healthy' : current.accountRef || current.endpointUrl ? 'warning' : 'unknown',
                scopes: ['API token'],
                lastValidatedAt: new Date().toISOString(),
                lastValidationMessage: hasToken ? 'Token present.' : 'Missing CRM API token.'
            };
        } else {
            patch = {
                status: current.accountRef || current.endpointUrl ? 'configured' : 'not_connected',
                health: current.accountRef || current.endpointUrl ? 'warning' : 'unknown',
                scopes: [],
                lastValidatedAt: new Date().toISOString(),
                lastValidationMessage: current.accountRef || current.endpointUrl ? 'Manual handoff surface ready to use.' : 'Manual handoff surface not configured.'
            };
        }

        const saved = await writeSalesCockpitToWorkspace(updateProvider(state, providerId, {
            ...patch,
            ...withProviderLog(current, providerLog(
                patch.health === 'healthy' ? 'success' : patch.health === 'warning' ? 'warning' : 'info',
                `${current.label} validation: ${patch.status?.replace(/_/g, ' ') || 'unknown'}.`,
                patch.lastValidationMessage
            ))
        }));
        vscode.window.showInformationMessage(`${getProvider(saved, providerId).label} validation result: ${getProvider(saved, providerId).status.replace(/_/g, ' ')}.`);
        return saved;
    } catch (error: any) {
        const state = await readSalesCockpitFromWorkspace();
        const current = getProvider(state, providerId);
        await writeSalesCockpitToWorkspace(updateProvider(state, providerId, {
            health: 'error',
            lastValidatedAt: new Date().toISOString(),
            lastValidationMessage: error?.message || String(error),
            ...withProviderLog(current, providerLog('error', `${current.label} validation failed.`, error?.message || String(error)))
        }));
        vscode.window.showErrorMessage(`Failed to validate provider: ${error?.message || error}`);
        return readSalesCockpitFromWorkspace();
    }
}

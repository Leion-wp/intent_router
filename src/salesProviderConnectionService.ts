import * as vscode from 'vscode';
import {
    createDefaultSalesCockpitState,
    readSalesCockpitFromWorkspace,
    SalesCockpitState,
    SalesProviderAccount,
    SalesProviderId,
    writeSalesCockpitToWorkspace
} from './salesCockpitStore';

const SECRET_PREFIX = 'leionRoots.salesProvider';

const PROVIDER_SECRET_KEYS: Record<SalesProviderId, string[]> = {
    email: ['smtpPassword', 'smtpUsername'],
    google_sheets: ['accessToken'],
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
        lastValidatedAt: new Date().toISOString()
    });
}

async function connectTokenProvider(
    context: vscode.ExtensionContext,
    state: SalesCockpitState,
    providerId: 'google_sheets' | 'crm',
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

    await storeSecret(context, providerId, providerId === 'crm' ? 'apiToken' : 'accessToken', secret);

    return updateProvider(state, providerId, {
        accountRef,
        endpointUrl,
        status: secret ? 'connected' : 'configured',
        lastValidatedAt: new Date().toISOString()
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
        lastValidatedAt: accountRef || endpointUrl ? new Date().toISOString() : undefined
    });
}

export async function connectSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState | undefined> {
    const state = await readSalesCockpitFromWorkspace();
    let next: SalesCockpitState | undefined;

    if (providerId === 'email') {
        next = await connectEmail(context, state);
    } else if (providerId === 'google_sheets') {
        next = await connectTokenProvider(context, state, 'google_sheets', {
            accountPrompt: 'Google Sheets account or service account email',
            accountPlaceholder: 'founder@company.com or service-account@project.iam.gserviceaccount.com',
            endpointPrompt: 'Google Sheet URL',
            endpointPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
            secretPrompt: 'Google Sheets token or service-account secret'
        });
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

    const saved = await writeSalesCockpitToWorkspace(next);
    vscode.window.showInformationMessage(`${getProvider(saved, providerId).label} connected in Leion Cockpit.`);
    return saved;
}

export async function disconnectSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState> {
    const state = await readSalesCockpitFromWorkspace();
    const defaults = createDefaultSalesCockpitState();
    const fallback = defaults.providerAccounts.find((provider) => provider.id === providerId)!;

    for (const key of PROVIDER_SECRET_KEYS[providerId] || []) {
        await context.secrets.delete(providerSecretKey(providerId, key));
    }

    const next = updateProvider(state, providerId, {
        ...fallback,
        lastValidatedAt: undefined
    });
    const saved = await writeSalesCockpitToWorkspace(next);
    vscode.window.showInformationMessage(`${fallback.label} disconnected from Leion Cockpit.`);
    return saved;
}

export async function validateSalesProvider(context: vscode.ExtensionContext, providerId: SalesProviderId): Promise<SalesCockpitState> {
    const state = await readSalesCockpitFromWorkspace();
    const current = getProvider(state, providerId);

    let status: SalesProviderAccount['status'] = 'not_connected';

    if (providerId === 'email') {
        const hasPasswordSecret = await hasSecret(context, 'email', 'smtpPassword');
        status = current.accountRef && current.endpointUrl && hasPasswordSecret ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected';
    } else if (providerId === 'google_sheets') {
        const hasToken = await hasSecret(context, 'google_sheets', 'accessToken');
        status = current.accountRef && current.endpointUrl && hasToken ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected';
    } else if (providerId === 'crm') {
        const hasToken = await hasSecret(context, 'crm', 'apiToken');
        status = current.accountRef && current.endpointUrl && hasToken ? 'connected' : current.accountRef || current.endpointUrl ? 'configured' : 'not_connected';
    } else {
        status = current.accountRef || current.endpointUrl ? 'configured' : 'not_connected';
    }

    const next = updateProvider(state, providerId, {
        status,
        lastValidatedAt: new Date().toISOString()
    });
    const saved = await writeSalesCockpitToWorkspace(next);
    vscode.window.showInformationMessage(`${current.label} validation result: ${status.replace(/_/g, ' ')}.`);
    return saved;
}

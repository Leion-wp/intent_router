import * as https from 'https';
import { getValidGoogleWorkspaceSession } from './googleOAuthService';
import { SalesCockpitLead, SalesCockpitOffer, SalesCockpitProofAsset, SalesCockpitTask } from './salesCockpitStore';
import * as vscode from 'vscode';

type SpreadsheetSheet = {
    properties?: {
        title?: string;
    };
};

type SpreadsheetMetadata = {
    sheets?: SpreadsheetSheet[];
};

type BatchUpdateResponse = {
    spreadsheetId?: string;
};

type SpreadsheetCreateResponse = {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
};

type ValueRange = {
    values?: Array<Array<string>>;
};

function extractSpreadsheetId(sheetUrl: string): string {
    const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(String(sheetUrl || '').trim());
    if (!match?.[1]) {
        throw new Error('Invalid Google Sheet URL.');
    }
    return match[1];
}

function jsonRequest<T>(urlString: string, accessToken: string, method: 'GET' | 'POST', body?: string): Promise<T> {
    const url = new URL(urlString);
    return new Promise<T>((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                method,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {})
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
                        resolve(raw ? JSON.parse(raw) as T : ({} as T));
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

async function ensureSheetTabs(accessToken: string, spreadsheetId: string, titles: string[]): Promise<void> {
    const metadata = await jsonRequest<SpreadsheetMetadata>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
        accessToken,
        'GET'
    );
    const existingTitles = new Set((metadata.sheets || []).map((sheet) => String(sheet.properties?.title || '').trim()).filter(Boolean));
    const requests = titles
        .filter((title) => !existingTitles.has(title))
        .map((title) => ({
            addSheet: {
                properties: {
                    title
                }
            }
        }));
    if (requests.length === 0) {
        return;
    }
    await jsonRequest<BatchUpdateResponse>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        accessToken,
        'POST',
        JSON.stringify({ requests })
    );
}

function buildOfferRows(offer: SalesCockpitOffer): Array<Array<string>> {
    return [
        ['Field', 'Value'],
        ['Name', offer.name],
        ['Audience', offer.audience],
        ['Problem', offer.problem],
        ['Promise', offer.promise],
        ['Proof', offer.proof],
        ['Call To Action', offer.callToAction]
    ];
}

function buildLeadRows(leads: SalesCockpitLead[]): Array<Array<string>> {
    return [
        ['Company', 'Contact Name', 'Role', 'Email', 'Stage', 'Pain', 'Next Action', 'Due Date', 'Profile URL', 'Notes'],
        ...leads.map((lead) => [
            lead.company,
            lead.contactName,
            lead.role,
            lead.email || '',
            lead.status,
            lead.pain,
            lead.nextAction,
            lead.dueDate || '',
            lead.profileUrl || '',
            lead.notes || ''
        ])
    ];
}

function buildProofRows(proofAssets: SalesCockpitProofAsset[]): Array<Array<string>> {
    return [
        ['Title', 'Kind', 'Status', 'Summary', 'Source Label', 'Source Ref', 'Created At'],
        ...proofAssets.map((asset) => [
            asset.title,
            asset.kind,
            asset.status,
            asset.summary,
            asset.sourceLabel || '',
            asset.sourceRef || '',
            asset.createdAt
        ])
    ];
}

function buildActionRows(tasks: SalesCockpitTask[]): Array<Array<string>> {
    return [
        ['Title', 'Kind', 'Status', 'Due Date', 'Owner', 'Lead Id', 'Detail', 'Source Ref'],
        ...tasks.map((task) => [
            task.title,
            task.kind,
            task.status,
            task.dueDate || '',
            task.owner,
            task.leadId || '',
            task.detail || '',
            task.sourceRef || ''
        ])
    ];
}

export async function exportProductToGoogleSheets(
    context: vscode.ExtensionContext,
    input: {
        sheetUrl: string;
        offer: SalesCockpitOffer;
        leads: SalesCockpitLead[];
        proofAssets?: SalesCockpitProofAsset[];
        tasks?: SalesCockpitTask[];
    }
): Promise<void> {
    const session = await getValidGoogleWorkspaceSession(context);
    if (!session.accessToken) {
        throw new Error('Google Workspace is not connected.');
    }
    const spreadsheetId = extractSpreadsheetId(input.sheetUrl);
    await ensureSheetTabs(session.accessToken, spreadsheetId, ['Offer', 'Leads', 'Proof', 'Actions']);

    await jsonRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        session.accessToken,
        'POST',
        JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: [
                {
                    range: 'Offer!A1:B20',
                    values: buildOfferRows(input.offer)
                },
                {
                    range: 'Leads!A1:J500',
                    values: buildLeadRows(input.leads)
                },
                {
                    range: 'Proof!A1:G500',
                    values: buildProofRows(Array.isArray(input.proofAssets) ? input.proofAssets : [])
                },
                {
                    range: 'Actions!A1:H500',
                    values: buildActionRows(Array.isArray(input.tasks) ? input.tasks : [])
                }
            ]
        })
    );
}

export async function createCockpitGoogleSheet(
    context: vscode.ExtensionContext,
    input: {
        title: string;
        offer: SalesCockpitOffer;
        leads: SalesCockpitLead[];
        proofAssets?: SalesCockpitProofAsset[];
        tasks?: SalesCockpitTask[];
    }
): Promise<{ sheetUrl: string }> {
    const session = await getValidGoogleWorkspaceSession(context);
    if (!session.accessToken) {
        throw new Error('Google Workspace is not connected.');
    }

    const title = String(input.title || '').trim() || 'Leion Cockpit';
    const created = await jsonRequest<SpreadsheetCreateResponse>(
        'https://sheets.googleapis.com/v4/spreadsheets',
        session.accessToken,
        'POST',
        JSON.stringify({
            properties: {
                title
            },
            sheets: [
                { properties: { title: 'Offer' } },
                { properties: { title: 'Leads' } },
                { properties: { title: 'Proof' } },
                { properties: { title: 'Actions' } }
            ]
        })
    );

    if (!created.spreadsheetId) {
        throw new Error('Google Sheets did not return a spreadsheet id.');
    }

    const sheetUrl = created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`;
    await exportProductToGoogleSheets(context, {
        sheetUrl,
        offer: input.offer,
        leads: input.leads,
        proofAssets: input.proofAssets,
        tasks: input.tasks
    });

    return { sheetUrl };
}

export async function importLeadsFromGoogleSheets(
    context: vscode.ExtensionContext,
    sheetUrl: string
): Promise<{
    leads: SalesCockpitLead[];
    tasks: SalesCockpitTask[];
}> {
    const session = await getValidGoogleWorkspaceSession(context);
    if (!session.accessToken) {
        throw new Error('Google Workspace is not connected.');
    }
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    const response = await jsonRequest<ValueRange>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Leads!A2:J500`,
        session.accessToken,
        'GET'
    );
    const rows = Array.isArray(response.values) ? response.values : [];

    const leads = rows
        .map((row, index) => {
            const company = String(row?.[0] || '').trim();
            if (!company) {
                return null;
            }
            return {
                id: `sheet-${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
                company,
                contactName: String(row?.[1] || '').trim(),
                role: String(row?.[2] || '').trim(),
                email: String(row?.[3] || '').trim() || undefined,
                status: (String(row?.[4] || 'target').trim() || 'target') as SalesCockpitLead['status'],
                pain: String(row?.[5] || '').trim(),
                nextAction: String(row?.[6] || '').trim(),
                dueDate: String(row?.[7] || '').trim() || undefined,
                profileUrl: String(row?.[8] || '').trim() || undefined,
                notes: String(row?.[9] || '').trim() || undefined,
                owner: 'founder'
            } as SalesCockpitLead;
        })
        .filter((entry): entry is SalesCockpitLead => !!entry);

    const actionResponse = await jsonRequest<ValueRange>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Actions!A2:H500`,
        session.accessToken,
        'GET'
    );
    const actionRows = Array.isArray(actionResponse.values) ? actionResponse.values : [];
    const tasks = actionRows
        .map((row, index) => {
            const title = String(row?.[0] || '').trim();
            if (!title) {
                return null;
            }
            return {
                id: `sheet-action-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
                title,
                kind: (String(row?.[1] || 'outreach').trim() || 'outreach') as SalesCockpitTask['kind'],
                status: String(row?.[2] || 'todo').trim() === 'done' ? 'done' : 'todo',
                dueDate: String(row?.[3] || '').trim() || undefined,
                owner: String(row?.[4] || 'founder').trim() || 'founder',
                leadId: String(row?.[5] || '').trim() || undefined,
                detail: String(row?.[6] || '').trim() || undefined,
                sourceRef: String(row?.[7] || '').trim() || undefined
            } as SalesCockpitTask;
        })
        .filter((entry): entry is SalesCockpitTask => !!entry);

    return {
        leads,
        tasks
    };
}

export async function openGoogleSheet(sheetUrl: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(sheetUrl));
}

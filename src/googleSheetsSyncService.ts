import * as https from 'https';
import { getValidGoogleWorkspaceSession } from './googleOAuthService';
import { SalesCockpitLead, SalesCockpitOffer } from './salesCockpitStore';
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

export async function exportProductToGoogleSheets(
    context: vscode.ExtensionContext,
    input: {
        sheetUrl: string;
        offer: SalesCockpitOffer;
        leads: SalesCockpitLead[];
    }
): Promise<void> {
    const session = await getValidGoogleWorkspaceSession(context);
    if (!session.accessToken) {
        throw new Error('Google Workspace is not connected.');
    }
    const spreadsheetId = extractSpreadsheetId(input.sheetUrl);
    await ensureSheetTabs(session.accessToken, spreadsheetId, ['Offer', 'Leads']);

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
                }
            ]
        })
    );
}

export async function importLeadsFromGoogleSheets(
    context: vscode.ExtensionContext,
    sheetUrl: string
): Promise<SalesCockpitLead[]> {
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

    return rows
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
}

export async function openGoogleSheet(sheetUrl: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(sheetUrl));
}

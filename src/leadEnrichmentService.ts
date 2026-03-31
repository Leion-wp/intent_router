import * as http from 'http';
import * as https from 'https';
import { SalesCockpitLead } from './salesCockpitStore';

type FetchResult = {
    finalUrl: string;
    body: string;
};

type EnrichmentSummary = {
    leadId: string;
    company: string;
    emails: string[];
    finalUrl?: string;
};

type EnrichmentResult = {
    leads: SalesCockpitLead[];
    enrichedCount: number;
    leadsWithEmail: number;
    summaries: EnrichmentSummary[];
    updated: number;
    skipped: number;
    errors: string[];
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeionCockpit/0.1';
const MAX_REDIRECTS = 4;
const MAX_BODY_BYTES = 350_000;

function decodeHtml(value: string): string {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTags(value: string): string {
    return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '));
}

function normalizeUrl(raw: string): string | undefined {
    const value = String(raw || '').trim();
    if (!value) {
        return undefined;
    }
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return undefined;
        }
        return url.toString();
    } catch {
        try {
            const url = new URL(`https://${value}`);
            return url.toString();
        } catch {
            return undefined;
        }
    }
}

function fetchHtml(urlString: string, redirects = 0): Promise<FetchResult> {
    const url = new URL(urlString);
    const transport = url.protocol === 'http:' ? http : https;

    return new Promise<FetchResult>((resolve, reject) => {
        const request = transport.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || undefined,
                path: `${url.pathname}${url.search}`,
                method: 'GET',
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml'
                }
            },
            (response) => {
                const statusCode = response.statusCode || 0;
                const location = String(response.headers.location || '').trim();
                if (statusCode >= 300 && statusCode < 400 && location) {
                    response.resume();
                    if (redirects >= MAX_REDIRECTS) {
                        reject(new Error('Too many redirects while enriching lead.'));
                        return;
                    }
                    const nextUrl = new URL(location, url).toString();
                    void fetchHtml(nextUrl, redirects + 1).then(resolve, reject);
                    return;
                }
                if (statusCode >= 400) {
                    response.resume();
                    reject(new Error(`HTTP ${statusCode}`));
                    return;
                }

                const chunks: Buffer[] = [];
                let totalBytes = 0;
                response.on('data', (chunk) => {
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    totalBytes += buffer.length;
                    if (totalBytes <= MAX_BODY_BYTES) {
                        chunks.push(buffer);
                    }
                });
                response.on('end', () => {
                    resolve({
                        finalUrl: url.toString(),
                        body: Buffer.concat(chunks).toString('utf8')
                    });
                });
            }
        );

        request.on('error', reject);
        request.end();
    });
}

function extractTitle(html: string): string | undefined {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match?.[1] ? stripTags(match[1]) : undefined;
}

function extractMetaContent(html: string, key: 'description' | 'og:description' | 'og:site_name'): string | undefined {
    const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
    const match = regex.exec(html);
    return match?.[1] ? stripTags(match[1]) : undefined;
}

function extractEmails(html: string): string[] {
    const emails = Array.from(String(html || '').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig))
        .map((match) => String(match[0] || '').trim().toLowerCase())
        .filter((email) => !email.endsWith('.png') && !email.endsWith('.jpg') && !email.endsWith('.svg'));
    return Array.from(new Set(emails)).slice(0, 4);
}

function extractContactCandidates(html: string, baseUrl: string): string[] {
    const hrefMatches = Array.from(String(html || '').matchAll(/href=["']([^"']+)["']/ig))
        .map((match) => String(match[1] || '').trim())
        .filter(Boolean);

    const candidates = hrefMatches
        .filter((href) => /contact|about|team/i.test(href))
        .map((href) => {
            try {
                return new URL(href, baseUrl).toString();
            } catch {
                return '';
            }
        })
        .filter(Boolean);

    try {
        const root = new URL(baseUrl);
        const fallback = [
            new URL('/contact', root).toString(),
            new URL('/contact-us', root).toString(),
            new URL('/about', root).toString()
        ];
        candidates.push(...fallback);
    } catch {
        // Ignore invalid root.
    }

    return Array.from(new Set(candidates)).slice(0, 3);
}

function appendNote(existing: string | undefined, lines: string[]): string {
    const clean = lines.map((line) => String(line || '').trim()).filter(Boolean);
    if (clean.length === 0) {
        return existing || '';
    }
    const block = ['[Enrichment]', ...clean].join('\n');
    return existing ? `${existing}\n\n${block}` : block;
}

async function enrichOneLead(lead: SalesCockpitLead): Promise<{ lead: SalesCockpitLead; summary?: EnrichmentSummary }> {
    const targetUrl = normalizeUrl(lead.profileUrl || '');
    if (!targetUrl) {
        return { lead };
    }

    try {
        const homepage = await fetchHtml(targetUrl);
        let emails = extractEmails(homepage.body);
        let title = extractTitle(homepage.body);
        let description = extractMetaContent(homepage.body, 'description')
            || extractMetaContent(homepage.body, 'og:description');
        const siteName = extractMetaContent(homepage.body, 'og:site_name');

        if (emails.length === 0) {
            const candidates = extractContactCandidates(homepage.body, homepage.finalUrl);
            for (const candidate of candidates) {
                try {
                    const contactPage = await fetchHtml(candidate);
                    const extracted = extractEmails(contactPage.body);
                    if (extracted.length > 0) {
                        emails = extracted;
                        if (!description) {
                            description = extractMetaContent(contactPage.body, 'description')
                                || extractMetaContent(contactPage.body, 'og:description')
                                || description;
                        }
                        break;
                    }
                } catch {
                    // Try next candidate.
                }
            }
        }

        const nextLead: SalesCockpitLead = {
            ...lead,
            email: lead.email || emails[0] || undefined,
            status: lead.email || emails[0]
                ? (lead.status === 'candidate' || lead.status === 'reviewed' || lead.status === 'enriched' ? 'ready_for_draft' : lead.status)
                : (lead.status === 'candidate' ? 'reviewed' : 'enriched'),
            nextAction: lead.email || emails[0]
                ? 'Relire les informations enrichies puis preparer un draft Gmail.'
                : lead.nextAction || 'Chercher un contact humain ou une adresse email exploitable.',
            notes: appendNote(lead.notes, [
                siteName ? `Site: ${siteName}` : '',
                title ? `Titre: ${title}` : '',
                description ? `Description: ${description}` : '',
                emails.length > 0 ? `Emails trouves: ${emails.join(', ')}` : 'Aucun email trouve automatiquement.'
            ]),
            profileUrl: homepage.finalUrl || lead.profileUrl,
            sourceUrl: lead.sourceUrl || homepage.finalUrl,
            snippet: lead.snippet || description,
            enrichment: {
                status: emails.length > 0 ? 'complete' : 'partial',
                attempts: Math.max(1, Number(lead.enrichment?.attempts || 0) + 1),
                lastAttemptAt: new Date().toISOString(),
                lastSuccessAt: new Date().toISOString(),
                error: undefined,
                sources: Array.from(new Set([homepage.finalUrl, ...(lead.enrichment?.sources || [])])).filter(Boolean)
            }
        };

        return {
            lead: nextLead,
            summary: {
                leadId: lead.id,
                company: lead.company,
                emails,
                finalUrl: homepage.finalUrl
            }
        };
    } catch (error: any) {
        return {
            lead: {
                ...lead,
                enrichment: {
                    status: 'failed',
                    attempts: Math.max(1, Number(lead.enrichment?.attempts || 0) + 1),
                    lastAttemptAt: new Date().toISOString(),
                    lastSuccessAt: lead.enrichment?.lastSuccessAt,
                    error: error?.message || String(error),
                    sources: lead.enrichment?.sources || []
                }
            }
        };
    }
}

export async function enrichCockpitLeads(leads: SalesCockpitLead[], maxLeads = 8, leadIds?: string[]): Promise<EnrichmentResult> {
    const nextLeads: SalesCockpitLead[] = [];
    const summaries: EnrichmentSummary[] = [];
    let processed = 0;
    let leadsWithEmail = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const selectedIds = Array.isArray(leadIds) && leadIds.length > 0 ? new Set(leadIds.map((entry) => String(entry).trim())) : undefined;

    for (const lead of leads) {
        const shouldEnrich = processed < maxLeads
            && (!selectedIds || selectedIds.has(String(lead.id || '').trim()))
            && !!normalizeUrl(lead.profileUrl || '')
            && (!lead.email || !String(lead.notes || '').includes('[Enrichment]') || lead.status === 'reviewed' || lead.status === 'enriched');

        if (!shouldEnrich) {
            nextLeads.push(lead);
            if (lead.email) {
                leadsWithEmail += 1;
            }
            skipped += 1;
            continue;
        }

        const enriched = await enrichOneLead(lead);
        nextLeads.push(enriched.lead);
        if (enriched.lead.email) {
            leadsWithEmail += 1;
        }
        if (enriched.summary) {
            summaries.push(enriched.summary);
        }
        if (enriched.lead.enrichment?.status === 'failed' && enriched.lead.enrichment.error) {
            errors.push(`${lead.company}: ${enriched.lead.enrichment.error}`);
        } else {
            updated += 1;
        }
        processed += 1;
    }

    return {
        leads: nextLeads,
        enrichedCount: summaries.length,
        leadsWithEmail,
        summaries,
        updated,
        skipped,
        errors
    };
}

import * as https from 'https';
import { SalesCockpitLead, SalesCockpitOffer, slugify } from './salesCockpitStore';

type SearchHit = {
    query: string;
    title: string;
    url: string;
    snippet: string;
};

const SEARCH_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeionCockpit/0.1';
const BLOCKED_HOST_PATTERNS = [
    'duckduckgo.com',
    'google.com',
    'bing.com',
    'youtube.com',
    'facebook.com',
    'instagram.com'
];

function decodeHtml(value: string): string {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTags(value: string): string {
    return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '));
}

function httpGet(urlString: string): Promise<string> {
    const url = new URL(urlString);
    return new Promise((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                method: 'GET',
                headers: {
                    'User-Agent': SEARCH_USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml'
                }
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                response.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf8');
                    if (response.statusCode && response.statusCode >= 400) {
                        reject(new Error(body || `HTTP ${response.statusCode}`));
                        return;
                    }
                    resolve(body);
                });
            }
        );
        request.on('error', reject);
        request.end();
    });
}

function normalizeResultUrl(raw: string): string {
    const value = String(raw || '').trim();
    if (!value) {
        return '';
    }
    try {
        const url = new URL(value, 'https://duckduckgo.com');
        const redirected = url.searchParams.get('uddg');
        if (redirected) {
            return decodeURIComponent(redirected);
        }
        return url.toString();
    } catch {
        return value;
    }
}

function parseSearchResults(html: string, query: string): SearchHit[] {
    const titleMatches = Array.from(html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
    const snippetMatches = Array.from(html.matchAll(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi));

    return titleMatches.map((match, index) => ({
        query,
        url: normalizeResultUrl(match[1] || ''),
        title: stripTags(match[2] || ''),
        snippet: stripTags(snippetMatches[index]?.[1] || '')
    })).filter((entry) => !!entry.url && !!entry.title);
}

function buildQueries(offer: SalesCockpitOffer): string[] {
    const audience = String(offer.audience || '').trim();
    const problem = String(offer.problem || '').trim();
    const promise = String(offer.promise || '').trim();
    const name = String(offer.name || '').trim();

    return Array.from(new Set([
        `${audience} ${problem}`,
        `${audience} ${promise}`,
        `${audience} software agency github`,
        `${audience} engineering team workflow`,
        `${name} cible clients`,
        `${audience} logiciel b2b`
    ].map((entry) => entry.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 4);
}

function shouldKeepUrl(urlString: string): boolean {
    try {
        const host = new URL(urlString).hostname.toLowerCase().replace(/^www\./, '');
        return !BLOCKED_HOST_PATTERNS.some((pattern) => host.includes(pattern));
    } catch {
        return false;
    }
}

function hostnameLabel(urlString: string): string {
    try {
        const host = new URL(urlString).hostname.toLowerCase().replace(/^www\./, '');
        const base = host.split('.')[0] || host;
        return base
            .split(/[-_]+/g)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    } catch {
        return 'Prospect';
    }
}

function guessCompanyName(hit: SearchHit): string {
    const rawTitle = String(hit.title || '').trim();
    const candidates = rawTitle
        .split(/[\-|·|•|\|]/g)
        .map((part) => part.trim())
        .filter(Boolean);
    const preferred = candidates.find((candidate) => candidate.length >= 3 && candidate.length <= 60 && !candidate.toLowerCase().includes('linkedin'));
    return preferred || hostnameLabel(hit.url);
}

export async function runAutomaticLeadResearch(
    offer: SalesCockpitOffer,
    existingLeads: SalesCockpitLead[],
    maxLeads = 12
): Promise<{ leads: SalesCockpitLead[]; queries: string[] }> {
    const queries = buildQueries(offer);
    const hits: SearchHit[] = [];

    for (const query of queries) {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        try {
            const html = await httpGet(url);
            hits.push(...parseSearchResults(html, query));
        } catch {
            // Continue with other queries when one search source fails.
        }
    }

    const knownCompanies = new Set(existingLeads.map((lead) => lead.company.toLowerCase().trim()).filter(Boolean));
    const knownUrls = new Set(existingLeads.map((lead) => String(lead.profileUrl || '').trim().toLowerCase()).filter(Boolean));
    const leads: SalesCockpitLead[] = [];

    for (const hit of hits) {
        if (!shouldKeepUrl(hit.url)) {
            continue;
        }
        const company = guessCompanyName(hit);
        const normalizedCompany = company.toLowerCase().trim();
        const normalizedUrl = hit.url.toLowerCase().trim();
        if (!normalizedCompany || knownCompanies.has(normalizedCompany) || knownUrls.has(normalizedUrl)) {
            continue;
        }

        leads.push({
            id: `auto-${slugify(company)}-${leads.length + 1}`,
            company,
            contactName: '',
            role: '',
            status: 'target',
            pain: offer.problem,
            nextAction: 'Qualifier ce compte puis preparer un premier draft.',
            owner: 'founder',
            profileUrl: hit.url,
            notes: [
                `Source query: ${hit.query}`,
                hit.snippet ? `Snippet: ${hit.snippet}` : '',
                `Angle: ${offer.promise}`
            ].filter(Boolean).join('\n')
        });

        knownCompanies.add(normalizedCompany);
        knownUrls.add(normalizedUrl);

        if (leads.length >= maxLeads) {
            break;
        }
    }

    return {
        leads,
        queries
    };
}

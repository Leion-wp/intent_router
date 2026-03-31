import * as https from 'https';
import { LeadCandidateRecord, SalesCockpitLead, SalesCockpitOffer, slugify } from './salesCockpitStore';

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

function domainFromUrl(urlString: string): string {
    try {
        return new URL(urlString).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
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
    existingCandidatesOrMax: LeadCandidateRecord[] | number = [],
    maxCandidatesInput = 12
): Promise<{
    candidates: LeadCandidateRecord[];
    leads: SalesCockpitLead[];
    queries: string[];
    added: number;
    skipped: number;
    duplicates: number;
    errors: string[];
}> {
    const existingCandidates = Array.isArray(existingCandidatesOrMax) ? existingCandidatesOrMax : [];
    const maxCandidates = typeof existingCandidatesOrMax === 'number' ? existingCandidatesOrMax : maxCandidatesInput;
    const queries = buildQueries(offer);
    const hits: SearchHit[] = [];
    const errors: string[] = [];

    for (const query of queries) {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        try {
            const html = await httpGet(url);
            hits.push(...parseSearchResults(html, query));
        } catch (error: any) {
            errors.push(`${query}: ${error?.message || error}`);
        }
    }

    const knownCompanies = new Set(existingLeads.map((lead) => lead.company.toLowerCase().trim()).filter(Boolean));
    const knownUrls = new Set(existingLeads.map((lead) => String(lead.profileUrl || '').trim().toLowerCase()).filter(Boolean));
    const knownCandidateUrls = new Set(existingCandidates.map((candidate) => String(candidate.sourceUrl || '').trim().toLowerCase()).filter(Boolean));
    const knownDomains = new Set(existingLeads.map((lead) => String(lead.domain || '').trim().toLowerCase()).filter(Boolean));
    const candidates: LeadCandidateRecord[] = [];
    let duplicates = 0;
    let skipped = 0;

    for (const hit of hits) {
        if (!shouldKeepUrl(hit.url)) {
            skipped += 1;
            continue;
        }
        const company = guessCompanyName(hit);
        const normalizedCompany = company.toLowerCase().trim();
        const normalizedUrl = hit.url.toLowerCase().trim();
        const domain = domainFromUrl(hit.url);
        if (!normalizedCompany) {
            skipped += 1;
            continue;
        }
        if (knownCompanies.has(normalizedCompany) || knownUrls.has(normalizedUrl) || knownCandidateUrls.has(normalizedUrl) || knownDomains.has(domain)) {
            duplicates += 1;
            continue;
        }

        candidates.push({
            id: `candidate-${slugify(company)}-${candidates.length + 1}`,
            company,
            domain,
            sourceUrl: hit.url,
            sourceQuery: hit.query,
            snippet: hit.snippet,
            confidence: hit.snippet ? 0.72 : 0.55,
            status: 'candidate',
            discoveredAt: new Date().toISOString(),
            notes: `Angle: ${offer.promise}`
        });

        knownCompanies.add(normalizedCompany);
        knownUrls.add(normalizedUrl);
        knownCandidateUrls.add(normalizedUrl);
        knownDomains.add(domain);

        if (candidates.length >= maxCandidates) {
            break;
        }
    }

    return {
        candidates,
        leads: candidates.map((candidate) => ({
            id: candidate.id.replace(/^candidate-/, 'lead-'),
            company: candidate.company,
            contactName: '',
            role: '',
            status: 'reviewed',
            pain: offer.problem,
            nextAction: 'Qualifier ce compte puis preparer un premier draft.',
            owner: 'founder',
            profileUrl: candidate.sourceUrl,
            notes: [
                candidate.sourceQuery ? `Source query: ${candidate.sourceQuery}` : '',
                candidate.snippet ? `Snippet: ${candidate.snippet}` : '',
                `Angle: ${offer.promise}`
            ].filter(Boolean).join('\n'),
            domain: candidate.domain,
            sourceUrl: candidate.sourceUrl,
            sourceQuery: candidate.sourceQuery,
            snippet: candidate.snippet,
            confidence: candidate.confidence
        })),
        queries,
        added: candidates.length,
        skipped,
        duplicates,
        errors
    };
}

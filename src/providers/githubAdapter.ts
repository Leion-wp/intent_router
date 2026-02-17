import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { registerCapabilities } from '../registry';
import { pipelineEventBus } from '../eventBus';

type OpenPrArgs = {
    head?: string;
    base?: string;
    title?: string;
    body?: string;
    bodyFile?: string;
    draft?: boolean;
    cwd?: string;
    __meta?: {
        runId?: string;
        traceId?: string;
        stepId?: string;
    };
};

type PrRefArgs = {
    url?: string;
    number?: number | string;
    repo?: string;
    cwd?: string;
    __meta?: {
        runId?: string;
        traceId?: string;
        stepId?: string;
    };
};

type PrCommentArgs = PrRefArgs & {
    body?: string;
};

export function validateGitBranchRef(value: string, label: 'head' | 'base'): string {
    const ref = String(value || '').trim();
    if (!ref) {
        throw new Error(`github.openPr requires a non-empty ${label} branch.`);
    }
    if (/\s/.test(ref)) {
        throw new Error(`Invalid ${label} branch "${ref}": spaces are not allowed.`);
    }
    if (ref.startsWith('-')) {
        throw new Error(`Invalid ${label} branch "${ref}": cannot start with "-".`);
    }
    if (
        ref.includes('..') ||
        ref.includes('//') ||
        ref.includes('@{') ||
        /[~^:?*[\]\\]/.test(ref) ||
        ref.endsWith('.lock') ||
        ref.startsWith('/') ||
        ref.endsWith('/') ||
        ref.startsWith('.') ||
        ref.endsWith('.')
    ) {
        throw new Error(`Invalid ${label} branch "${ref}" (fails git ref safety rules).`);
    }
    return ref;
}

export function registerGitHubProvider(_context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'github',
        type: 'vscode',
        capabilities: [
            {
                capability: 'github.openPr',
                command: 'intentRouter.internal.githubOpenPr',
                description: 'Open a GitHub Pull Request with gh CLI',
                determinism: 'deterministic',
                args: [
                    { name: 'head', type: 'string', description: 'Head branch', required: true },
                    { name: 'base', type: 'string', description: 'Base branch', required: true },
                    { name: 'title', type: 'string', description: 'PR title', required: true },
                    { name: 'body', type: 'string', description: 'PR body markdown' },
                    { name: 'bodyFile', type: 'path', description: 'PR body markdown file path' },
                    { name: 'cwd', type: 'path', description: 'Repository working directory', default: '${workspaceRoot}' }
                ]
            },
            {
                capability: 'github.prChecks',
                command: 'intentRouter.internal.githubPrChecks',
                description: 'Fetch checks summary for a PR with gh CLI',
                determinism: 'deterministic',
                args: [
                    { name: 'url', type: 'string', description: 'PR URL (preferred)' },
                    { name: 'number', type: 'string', description: 'PR number (fallback)' },
                    { name: 'repo', type: 'string', description: 'repo owner/name (fallback)' },
                    { name: 'cwd', type: 'path', description: 'Repository working directory', default: '${workspaceRoot}' }
                ]
            },
            {
                capability: 'github.prRerunFailedChecks',
                command: 'intentRouter.internal.githubPrRerunFailedChecks',
                description: 'Re-run failed checks for a PR with gh CLI',
                determinism: 'deterministic',
                args: [
                    { name: 'url', type: 'string', description: 'PR URL (preferred)' },
                    { name: 'number', type: 'string', description: 'PR number (fallback)' },
                    { name: 'repo', type: 'string', description: 'repo owner/name (fallback)' },
                    { name: 'cwd', type: 'path', description: 'Repository working directory', default: '${workspaceRoot}' }
                ]
            },
            {
                capability: 'github.prComment',
                command: 'intentRouter.internal.githubPrComment',
                description: 'Post a comment on a PR with gh CLI',
                determinism: 'interactive',
                args: [
                    { name: 'url', type: 'string', description: 'PR URL (preferred)' },
                    { name: 'number', type: 'string', description: 'PR number (fallback)' },
                    { name: 'repo', type: 'string', description: 'repo owner/name (fallback)' },
                    { name: 'body', type: 'string', description: 'Comment body', required: true },
                    { name: 'cwd', type: 'path', description: 'Repository working directory', default: '${workspaceRoot}' }
                ]
            }
        ]
    });
}

function normalizeExecutionCwd(rawCwd: any): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || path.resolve('.');
    const raw = typeof rawCwd === 'string' ? rawCwd.trim() : '';

    if (!raw || raw === '.' || raw === '${workspaceRoot}') {
        return workspaceRoot;
    }
    if (raw.startsWith('${workspaceRoot}')) {
        const suffix = raw.slice('${workspaceRoot}'.length).trim().replace(/^[/\\]+/, '');
        return suffix ? path.resolve(workspaceRoot, suffix) : workspaceRoot;
    }
    return path.isAbsolute(raw) ? raw : path.resolve(workspaceRoot, raw);
}

function buildGhPrArgs(args: OpenPrArgs): string[] {
    const cliArgs = ['pr', 'create', '--head', String(args.head), '--base', String(args.base), '--title', String(args.title)];
    if (args.bodyFile) {
        cliArgs.push('--body-file', String(args.bodyFile));
    } else if (args.body) {
        cliArgs.push('--body', String(args.body));
    }
    if (args.draft) {
        cliArgs.push('--draft');
    }
    cliArgs.push('--json', 'url,number,state,isDraft');
    return cliArgs;
}

function runGhCommand(cliArgs: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = cp.spawn('gh', cliArgs, { cwd, env });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `gh exited with code ${code}`));
                return;
            }
            resolve(stdout);
        });
    });
}

function parsePrRefFromUrl(rawUrl: string): { repo: string; number: number } | null {
    const match = String(rawUrl || '').trim().match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/i);
    if (!match) return null;
    return {
        repo: match[1],
        number: Number(match[2])
    };
}

function resolvePrRef(args: PrRefArgs): { repo: string; number: number } {
    const fromUrl = parsePrRefFromUrl(String(args?.url || ''));
    if (fromUrl) return fromUrl;
    const repo = String(args?.repo || '').trim();
    const number = Number(args?.number);
    if (!repo || !Number.isFinite(number) || number <= 0) {
        throw new Error('github PR operation requires url or both repo + number.');
    }
    return { repo, number: Math.floor(number) };
}

function emitGithubStepLog(meta: any, text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
    const runId = meta?.runId;
    const intentId = meta?.traceId || '';
    const stepId = meta?.stepId;
    if (!runId || !intentId) return;
    pipelineEventBus.emit({
        type: 'stepLog',
        runId,
        intentId,
        stepId,
        text: text.endsWith('\n') ? text : `${text}\n`,
        stream
    });
}

function parsePrMetadata(output: string): { url: string; number?: number; state?: 'open' | 'closed' | 'merged'; isDraft?: boolean } {
    const trimmed = String(output || '').trim();
    if (!trimmed) {
        throw new Error('GitHub PR creation returned empty output.');
    }

    try {
        const json = JSON.parse(trimmed);
        if (json && typeof json.url === 'string' && json.url.trim()) {
            const rawState = String(json.state || '').trim().toLowerCase();
            const state = rawState === 'open' || rawState === 'closed' || rawState === 'merged'
                ? (rawState as 'open' | 'closed' | 'merged')
                : undefined;
            return {
                url: json.url.trim(),
                number: Number.isFinite(Number(json.number)) ? Number(json.number) : undefined,
                state,
                isDraft: json.isDraft === true
            };
        }
    } catch {
        // fallback: detect URL from plaintext output
    }

    const match = trimmed.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i);
    if (match) {
        return { url: match[0] };
    }
    throw new Error(`Unable to extract PR URL from gh output: ${trimmed}`);
}

export async function executeGitHubOpenPr(args: OpenPrArgs): Promise<{ url: string; number?: number; state?: 'open' | 'closed' | 'merged'; isDraft?: boolean }> {
    const head = validateGitBranchRef(String(args?.head || ''), 'head');
    const base = validateGitBranchRef(String(args?.base || ''), 'base');
    const title = String(args?.title || '').trim();
    if (!head || !base || !title) {
        throw new Error('github.openPr requires head, base, and title.');
    }

    const cwd = normalizeExecutionCwd(args?.cwd);
    const cliArgs = buildGhPrArgs(args);
    const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
    const env = { ...process.env, ...envOverrides };
    const output = await runGhCommand(cliArgs, cwd, env);
    const pr = parsePrMetadata(output);
    const url = pr.url;
    const runId = args?.__meta?.runId;
    const intentId = args?.__meta?.traceId || '';
    const stepId = args?.__meta?.stepId;

    emitGithubStepLog(args?.__meta, `[github] PR created: ${url}`, 'stdout');

    pipelineEventBus.emit({
        type: 'githubPullRequestCreated',
        runId,
        intentId,
        stepId,
        provider: 'github',
        url,
        number: pr.number,
        state: pr.state,
        isDraft: pr.isDraft,
        head,
        base,
        title
    });

    return pr;
}

export async function executeGitHubPrChecks(args: PrRefArgs): Promise<{ repo: string; number: number; output: string }> {
    const ref = resolvePrRef(args);
    const cwd = normalizeExecutionCwd(args?.cwd);
    const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
    const env = { ...process.env, ...envOverrides };
    const cliArgs = ['pr', 'checks', String(ref.number), '--repo', ref.repo];
    const output = await runGhCommand(cliArgs, cwd, env);
    emitGithubStepLog(args?.__meta, `[github] Checks fetched for PR #${ref.number} (${ref.repo})`, 'stdout');
    return { ...ref, output: String(output || '') };
}

export async function executeGitHubPrRerunFailedChecks(args: PrRefArgs): Promise<{ repo: string; number: number }> {
    const ref = resolvePrRef(args);
    const cwd = normalizeExecutionCwd(args?.cwd);
    const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
    const env = { ...process.env, ...envOverrides };
    const cliArgs = ['pr', 'checks', String(ref.number), '--repo', ref.repo, '--rerun-failed'];
    await runGhCommand(cliArgs, cwd, env);
    emitGithubStepLog(args?.__meta, `[github] Re-run failed checks requested for PR #${ref.number} (${ref.repo})`, 'stdout');
    return ref;
}

export async function executeGitHubPrComment(args: PrCommentArgs): Promise<{ repo: string; number: number }> {
    const ref = resolvePrRef(args);
    const body = String(args?.body || '').trim();
    if (!body) {
        throw new Error('github.prComment requires a non-empty body.');
    }
    const cwd = normalizeExecutionCwd(args?.cwd);
    const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
    const env = { ...process.env, ...envOverrides };
    const cliArgs = ['pr', 'comment', String(ref.number), '--repo', ref.repo, '--body', body];
    await runGhCommand(cliArgs, cwd, env);
    emitGithubStepLog(args?.__meta, `[github] Comment posted on PR #${ref.number} (${ref.repo})`, 'stdout');
    return ref;
}

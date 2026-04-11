import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { glob } from 'glob';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { validateSafeRelativePath } from '../security';

type DocsSearchArgs = {
    query?: string;
    root?: string;
    include?: string;
    exclude?: string;
    maxResults?: string | number;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    __meta?: {
        runId?: string;
        traceId?: string;
        stepId?: string;
    };
};

type DocsWriteArgs = {
    path?: string;
    filePath?: string;
    content?: any;
    text?: any;
    encoding?: string;
    append?: boolean;
    __meta?: {
        runId?: string;
        traceId?: string;
        stepId?: string;
    };
};

type SearchMatch = {
    path: string;
    line: number;
    column: number;
    snippet: string;
    score: number;
};

function resolveWorkspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return path.resolve(folder?.fsPath || folder?.path || process.cwd());
}

function resolveSearchRoot(rawRoot: any): string {
    const workspaceRoot = resolveWorkspaceRoot();
    const rootValue = String(rawRoot || '').trim();
    if (!rootValue || rootValue === '.' || rootValue === '${workspaceRoot}') {
        return workspaceRoot;
    }
    const candidate = path.isAbsolute(rootValue)
        ? path.normalize(rootValue)
        : path.resolve(workspaceRoot, rootValue);
    validateSafeRelativePath(path.relative(workspaceRoot, candidate) || '.', workspaceRoot, workspaceRoot);
    return candidate;
}

function resolveWritableFilePath(rawPath: any): { workspaceRoot: string; absolutePath: string; relativePath: string } {
    const workspaceRoot = resolveWorkspaceRoot();
    const rawValue = String(rawPath || '').trim();
    if (!rawValue) {
        throw new Error('docs.write requires "path".');
    }
    const candidate = path.isAbsolute(rawValue)
        ? path.normalize(rawValue)
        : path.resolve(workspaceRoot, rawValue);
    validateSafeRelativePath(path.relative(workspaceRoot, candidate) || '.', workspaceRoot, workspaceRoot);
    return {
        workspaceRoot,
        absolutePath: candidate,
        relativePath: path.relative(workspaceRoot, candidate) || path.basename(candidate)
    };
}

function emitDocsLog(meta: DocsSearchArgs['__meta'], text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
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

function parsePatternList(raw: any, fallback: string[]): string[] {
    if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    const value = String(raw || '').trim();
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
    } catch {
        // fall through to CSV parsing
    }
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function isSearchableTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) return true;
    return [
        '.txt', '.md', '.markdown', '.rst', '.json', '.jsonc', '.json5',
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss',
        '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
        '.csv', '.tsv', '.sql', '.prisma', '.py', '.rb', '.go', '.java',
        '.cs', '.php', '.sh', '.ps1', '.bat', '.cmd'
    ].includes(ext);
}

function buildSnippet(line: string, column: number, matchLength: number): string {
    const maxWidth = 180;
    const start = Math.max(0, column - 1 - Math.floor(maxWidth / 3));
    const end = Math.min(line.length, start + maxWidth);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < line.length ? '...' : '';
    const snippet = line.slice(start, end);
    if (!snippet) {
        return line.trim();
    }
    return `${prefix}${snippet}${suffix}`.trim();
}

export function registerDocsProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.docsSearch', async (args: any) => {
        return await executeDocsSearchCommand(args);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.docsWrite', async (args: any) => {
        return await executeDocsWriteCommand(args);
    }));

    registerCapabilities({
        provider: 'docs',
        type: 'vscode',
        capabilities: [
            {
                capability: 'docs.search',
                command: 'intentRouter.internal.docsSearch',
                description: 'Search workspace documents locally and return ranked matches',
                determinism: 'deterministic',
                args: [
                    { name: 'query', type: 'string', description: 'Search query', required: true },
                    { name: 'root', type: 'path', description: 'Search root inside the workspace', default: '${workspaceRoot}' },
                    { name: 'include', type: 'string', description: 'CSV or JSON array of include globs', default: '**/*' },
                    { name: 'exclude', type: 'string', description: 'CSV or JSON array of exclude globs', default: '**/{node_modules,.git,out,dist}/**' },
                    { name: 'maxResults', type: 'string', description: 'Maximum number of matches', default: '20' },
                    { name: 'caseSensitive', type: 'boolean', description: 'Case-sensitive search', default: false },
                    { name: 'wholeWord', type: 'boolean', description: 'Match whole words only', default: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the JSON response' }
                ]
            },
            {
                capability: 'docs.write',
                command: 'intentRouter.internal.docsWrite',
                description: 'Write or append a text document inside the workspace',
                determinism: 'deterministic',
                args: [
                    { name: 'path', type: 'path', description: 'Target file path inside the workspace', required: true },
                    { name: 'content', type: 'string', description: 'Document content to write', required: true },
                    { name: 'encoding', type: 'string', description: 'File encoding', default: 'utf8' },
                    { name: 'append', type: 'boolean', description: 'Append instead of overwrite', default: false },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the JSON response' }
                ]
            }
        ]
    });
}

export async function executeDocsSearchCommand(args: DocsSearchArgs): Promise<{ content: string; data: any; status: number; statusText: string }> {
    const query = String(args?.query || '').trim();
    if (!query) {
        throw new Error('docs.search requires "query".');
    }

    const searchRoot = resolveSearchRoot(args?.root);
    const includePatterns = parsePatternList(args?.include, ['**/*']);
    const excludePatterns = parsePatternList(args?.exclude, ['**/{node_modules,.git,out,dist}/**']);
    const caseSensitive = args?.caseSensitive === true;
    const wholeWord = args?.wholeWord === true;
    const limitRaw = Number(args?.maxResults ?? 20);
    const maxResults = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 20;
    const needle = caseSensitive ? query : query.toLowerCase();
    const wordBoundary = wholeWord ? '\\b' : '';
    const escapedNeedle = escapeRegExp(needle);
    const matcher = wholeWord ? new RegExp(`${wordBoundary}${escapedNeedle}${wordBoundary}`, caseSensitive ? 'g' : 'gi') : undefined;

    emitDocsLog(args?.__meta, `[docs.search] root=${searchRoot}`);
    emitDocsLog(args?.__meta, `[docs.search] query="${query}" maxResults=${maxResults}`);

    const files = await collectCandidateFiles(searchRoot, includePatterns, excludePatterns);
    const matches: SearchMatch[] = [];

    for (const filePath of files) {
        if (matches.length >= maxResults) {
            break;
        }
        if (!isSearchableTextFile(filePath)) {
            continue;
        }
        let content = '';
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch {
            continue;
        }
        if (content.includes('\0')) {
            continue;
        }

        const relativePath = path.relative(searchRoot, filePath) || path.basename(filePath);
        const lines = content.replace(/\r\n/g, '\n').split('\n');
        for (let lineIndex = 0; lineIndex < lines.length && matches.length < maxResults; lineIndex += 1) {
            const line = lines[lineIndex];
            const searchLine = caseSensitive ? line : line.toLowerCase();
            if (!searchLine.includes(needle)) {
                continue;
            }

            if (matcher) {
                matcher.lastIndex = 0;
                let found: RegExpExecArray | null;
                while ((found = matcher.exec(line)) !== null && matches.length < maxResults) {
                    const column = found.index + 1;
                    matches.push({
                        path: relativePath,
                        line: lineIndex + 1,
                        column,
                        snippet: buildSnippet(line, column, found[0].length),
                        score: scoreMatch(lineIndex, column, found[0].length)
                    });
                    if (found[0].length === 0) {
                        matcher.lastIndex += 1;
                    }
                }
                continue;
            }

            const searchIndex = searchLine.indexOf(needle);
            const column = searchIndex + 1;
            matches.push({
                path: relativePath,
                line: lineIndex + 1,
                column,
                snippet: buildSnippet(line, column, needle.length),
                score: scoreMatch(lineIndex, column, needle.length)
            });
        }
    }

    const payload = {
        query,
        root: searchRoot,
        totalFilesScanned: files.length,
        matchCount: matches.length,
        matches
    };

    emitDocsLog(args?.__meta, `[docs.search] matches=${matches.length}/${files.length}`);

    return {
        content: JSON.stringify(payload),
        data: payload,
        status: 200,
        statusText: 'OK'
    };
}

export async function executeDocsWriteCommand(args: DocsWriteArgs): Promise<{ content: string; data: any; status: number; statusText: string }> {
    const pathValue = String(args?.path || args?.filePath || '').trim();
    if (!pathValue) {
        throw new Error('docs.write requires "path".');
    }
    const contentValue = args?.content ?? args?.text;
    if (contentValue === undefined || contentValue === null) {
        throw new Error('docs.write requires "content".');
    }

    const encoding = String(args?.encoding || 'utf8').trim() || 'utf8';
    const append = args?.append === true;
    const { workspaceRoot, absolutePath, relativePath } = resolveWritableFilePath(pathValue);
    const existedBefore = fs.existsSync(absolutePath);
    const serialized = typeof contentValue === 'string' ? contentValue : JSON.stringify(contentValue, null, 2);
    const bytesWritten = Buffer.byteLength(serialized, encoding as BufferEncoding);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    if (append) {
        fs.appendFileSync(absolutePath, serialized, { encoding: encoding as BufferEncoding });
    } else {
        fs.writeFileSync(absolutePath, serialized, { encoding: encoding as BufferEncoding });
    }

    const payload = {
        path: relativePath,
        absolutePath,
        workspaceRoot,
        mode: append ? 'append' : 'overwrite',
        existedBefore,
        bytesWritten,
        contentPreview: serialized.slice(0, 240),
        writtenAt: new Date().toISOString()
    };

    emitDocsLog(args?.__meta, `[docs.write] ${append ? 'appended' : 'wrote'} ${bytesWritten} byte(s) to ${relativePath}`);

    return {
        content: JSON.stringify(payload),
        data: payload,
        status: existedBefore ? 200 : 201,
        statusText: existedBefore ? 'OK' : 'Created'
    };
}

async function collectCandidateFiles(root: string, includePatterns: string[], excludePatterns: string[]): Promise<string[]> {
    const results = new Set<string>();
    for (const include of includePatterns) {
        const entries = await glob(include, {
            cwd: root,
            absolute: true,
            nodir: true,
            ignore: excludePatterns,
            dot: true
        });
        for (const entry of entries) {
            results.add(path.normalize(entry));
        }
    }
    return Array.from(results);
}

function scoreMatch(lineIndex: number, column: number, matchLength: number): number {
    const locationScore = Math.max(1, 10_000 - (lineIndex * 10) - column);
    const lengthScore = Math.max(1, 500 - matchLength);
    return locationScore + lengthScore;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

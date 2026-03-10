import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type RunMemoryScope = 'full_run' | 'run_segment' | 'variables' | 'raw';

export type RunMemoryRecord = {
    id: string;
    sessionId: string;
    key: string;
    tags: string[];
    scope: RunMemoryScope;
    runId?: string;
    stepId?: string;
    createdAt: number;
    data: any;
};

type RunMemoryDb = {
    version: number;
    records: RunMemoryRecord[];
};

type SaveRunMemoryInput = {
    sessionId: string;
    key?: string;
    tags?: string[];
    scope?: RunMemoryScope;
    runId?: string;
    stepId?: string;
    data: any;
};

type QueryRunMemoryInput = {
    sessionId?: string;
    key?: string;
    tag?: string;
    runId?: string;
    limit?: number;
    newestFirst?: boolean;
};

type ClearRunMemoryInput = {
    sessionId?: string;
    key?: string;
    tag?: string;
    runId?: string;
    keepLast?: number;
};

const MEMORY_FILE = path.join('.intent-router', 'run-memory-v2.json');

function getWorkspaceRoot(): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const fromFsPath = folder?.uri?.fsPath;
    if (typeof fromFsPath === 'string' && fromFsPath.trim()) {
        return fromFsPath;
    }
    const fromPath = (folder?.uri as any)?.path;
    if (typeof fromPath === 'string' && fromPath.trim()) {
        return fromPath;
    }
    return null;
}

function ensureMemoryDir(root: string): string {
    const dir = path.join(root, '.intent-router');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getMemoryPath(root: string): string {
    return path.join(root, MEMORY_FILE);
}

function toPositiveInt(raw: any, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function getTtlMs(): number {
    const rawDays = vscode.workspace.getConfiguration('intentRouter').get<number>('memory.ttlDays', 30);
    const days = toPositiveInt(rawDays, 30);
    return days * 24 * 60 * 60 * 1000;
}

function getMaxPerSession(): number {
    const raw = vscode.workspace.getConfiguration('intentRouter').get<number>('memory.maxRecordsPerSession', 200);
    return toPositiveInt(raw, 200);
}

function getMaxPayloadChars(): number {
    const raw = vscode.workspace.getConfiguration('intentRouter').get<number>('memory.maxPayloadChars', 120000);
    return toPositiveInt(raw, 120000);
}

function trimData(data: any): any {
    try {
        const maxChars = getMaxPayloadChars();
        const raw = JSON.stringify(data ?? null);
        if (raw.length <= maxChars) return data;
        return {
            __truncated: true,
            __originalSize: raw.length,
            preview: raw.slice(0, Math.max(32, maxChars))
        };
    } catch {
        return { __truncated: true, preview: String(data ?? '') };
    }
}

function normalizeRecord(entry: any): RunMemoryRecord | null {
    if (!entry || typeof entry !== 'object') return null;
    const sessionId = String(entry.sessionId || '').trim();
    const key = String(entry.key || '').trim() || 'entry';
    if (!sessionId) return null;
    return {
        id: String(entry.id || '').trim() || `mem_${Date.now().toString(36)}`,
        sessionId,
        key,
        tags: Array.isArray(entry.tags) ? entry.tags.map((t: any) => String(t || '').trim()).filter(Boolean) : [],
        scope: ((): RunMemoryScope => {
            const raw = String(entry.scope || '').trim().toLowerCase();
            if (raw === 'full_run' || raw === 'run_segment' || raw === 'variables' || raw === 'raw') {
                return raw as RunMemoryScope;
            }
            return 'raw';
        })(),
        runId: String(entry.runId || '').trim() || undefined,
        stepId: String(entry.stepId || '').trim() || undefined,
        createdAt: Number(entry.createdAt || Date.now()),
        data: entry.data
    };
}

function compactRecords(records: RunMemoryRecord[]): RunMemoryRecord[] {
    const cutoff = Date.now() - getTtlMs();
    const maxPerSession = getMaxPerSession();
    const sorted = [...records]
        .filter((entry) => Number(entry.createdAt || 0) >= cutoff)
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

    const perSession = new Map<string, RunMemoryRecord[]>();
    for (const entry of sorted) {
        const key = entry.sessionId;
        const list = perSession.get(key) || [];
        list.push(entry);
        perSession.set(key, list.slice(-maxPerSession));
    }

    const compacted: RunMemoryRecord[] = [];
    for (const list of perSession.values()) {
        compacted.push(...list);
    }
    compacted.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    return compacted;
}

function readDb(root: string): RunMemoryDb {
    const filePath = getMemoryPath(root);
    if (!fs.existsSync(filePath)) {
        return { version: 2, records: [] };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const list = Array.isArray(parsed?.records) ? parsed.records : [];
        const normalized = list.map(normalizeRecord).filter(Boolean) as RunMemoryRecord[];
        return { version: 2, records: compactRecords(normalized) };
    } catch {
        return { version: 2, records: [] };
    }
}

function writeDb(root: string, db: RunMemoryDb): void {
    ensureMemoryDir(root);
    const filePath = getMemoryPath(root);
    const sanitized: RunMemoryDb = {
        version: 2,
        records: compactRecords(
            (Array.isArray(db.records) ? db.records : [])
                .map((entry) => normalizeRecord(entry))
                .filter(Boolean)
                .map((entry) => ({ ...(entry as RunMemoryRecord), data: trimData((entry as RunMemoryRecord).data) })) as RunMemoryRecord[]
        )
    };
    fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
}

export function isRunMemoryEnabled(): boolean {
    return vscode.workspace.getConfiguration('intentRouter').get<boolean>('memory.enabled', true) === true;
}

export function saveRunMemory(input: SaveRunMemoryInput): { id: string } {
    const root = getWorkspaceRoot();
    if (!root) {
        throw new Error('Workspace root not found.');
    }
    const sessionId = String(input?.sessionId || '').trim() || 'default';
    const key = String(input?.key || '').trim() || 'entry';
    const scopeRaw = String(input?.scope || 'raw').trim().toLowerCase();
    const scope: RunMemoryScope =
        scopeRaw === 'full_run' || scopeRaw === 'run_segment' || scopeRaw === 'variables' || scopeRaw === 'raw'
            ? (scopeRaw as RunMemoryScope)
            : 'raw';
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const db = readDb(root);
    db.records.push({
        id,
        sessionId,
        key,
        tags: Array.isArray(input?.tags) ? input!.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
        scope,
        runId: String(input?.runId || '').trim() || undefined,
        stepId: String(input?.stepId || '').trim() || undefined,
        createdAt: Date.now(),
        data: trimData(input?.data)
    });
    writeDb(root, db);
    return { id };
}

export function queryRunMemory(input: QueryRunMemoryInput = {}): RunMemoryRecord[] {
    const root = getWorkspaceRoot();
    if (!root) {
        return [];
    }
    const db = readDb(root);
    let records = db.records;
    const sessionId = String(input?.sessionId || '').trim();
    const key = String(input?.key || '').trim();
    const tag = String(input?.tag || '').trim();
    const runId = String(input?.runId || '').trim();

    if (sessionId) {
        records = records.filter((entry) => entry.sessionId === sessionId);
    }
    if (key) {
        records = records.filter((entry) => entry.key === key);
    }
    if (tag) {
        records = records.filter((entry) => (entry.tags || []).includes(tag));
    }
    if (runId) {
        records = records.filter((entry) => String(entry.runId || '') === runId);
    }

    const newestFirst = input?.newestFirst !== false;
    const sorted = [...records].sort((a, b) =>
        newestFirst ? Number(b.createdAt || 0) - Number(a.createdAt || 0) : Number(a.createdAt || 0) - Number(b.createdAt || 0)
    );
    const limit = toPositiveInt(input?.limit, 20);
    return sorted.slice(0, limit);
}

export function clearRunMemory(input: ClearRunMemoryInput = {}): { removed: number; remaining: number } {
    const root = getWorkspaceRoot();
    if (!root) {
        return { removed: 0, remaining: 0 };
    }
    const db = readDb(root);
    const sessionId = String(input?.sessionId || '').trim();
    const key = String(input?.key || '').trim();
    const tag = String(input?.tag || '').trim();
    const runId = String(input?.runId || '').trim();
    const keepLast = Math.max(0, Number(input?.keepLast || 0) || 0);

    const matches = (entry: RunMemoryRecord): boolean => {
        if (sessionId && entry.sessionId !== sessionId) return false;
        if (key && entry.key !== key) return false;
        if (tag && !(entry.tags || []).includes(tag)) return false;
        if (runId && String(entry.runId || '') !== runId) return false;
        return true;
    };

    const matching = db.records.filter(matches).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const keepIds = new Set<string>(keepLast > 0 ? matching.slice(-keepLast).map((entry) => entry.id) : []);
    const next = db.records.filter((entry) => !matches(entry) || keepIds.has(entry.id));
    const removed = db.records.length - next.length;

    writeDb(root, { version: 2, records: next });
    return { removed, remaining: next.length };
}

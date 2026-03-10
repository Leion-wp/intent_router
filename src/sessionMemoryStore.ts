import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

type SessionMemoryEntry = {
    member: string;
    role: 'writer' | 'reviewer';
    path: string;
    contentSnippet: string;
    timestamp: number;
};

type SessionMemoryDb = {
    sessions: Record<string, SessionMemoryEntry[]>;
};

type SessionMemorySummary = {
    sessionId: string;
    entries: number;
    lastTimestamp?: number;
};

const MEMORY_FILE = path.join('.intent-router', 'session-memory.json');

function getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
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

function readDb(root: string): SessionMemoryDb {
    const filePath = getMemoryPath(root);
    if (!fs.existsSync(filePath)) {
        return { sessions: {} };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object') {
            return parsed as SessionMemoryDb;
        }
    } catch {
        // fallback to empty db
    }
    return { sessions: {} };
}

function writeDb(root: string, db: SessionMemoryDb): void {
    ensureMemoryDir(root);
    const filePath = getMemoryPath(root);
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
}

function getTtlMs(): number {
    const rawDays = vscode.workspace.getConfiguration('intentRouter').get<number>('ai.memory.ttlDays', 7);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.floor(rawDays)) : 7;
    return days * 24 * 60 * 60 * 1000;
}

function trimEntries(entries: SessionMemoryEntry[]): SessionMemoryEntry[] {
    const maxEntriesRaw = vscode.workspace.getConfiguration('intentRouter').get<number>('ai.memory.maxEntries', 40);
    const maxEntries = Number.isFinite(maxEntriesRaw) ? Math.max(5, Math.floor(maxEntriesRaw)) : 40;
    const cutoff = Date.now() - getTtlMs();
    const filtered = entries.filter((entry) => Number(entry?.timestamp || 0) >= cutoff);
    return filtered.slice(-maxEntries);
}

export function isSessionMemoryEnabled(): boolean {
    return vscode.workspace.getConfiguration('intentRouter').get<boolean>('ai.memory.enabled', false) === true;
}

export function loadSessionMemory(sessionId: string): SessionMemoryEntry[] {
    const root = getWorkspaceRoot();
    if (!root) {
        return [];
    }
    const key = String(sessionId || '').trim();
    if (!key) {
        return [];
    }
    const db = readDb(root);
    const entries = Array.isArray(db.sessions[key]) ? db.sessions[key] : [];
    return trimEntries(entries);
}

export function appendSessionMemory(sessionId: string, entries: SessionMemoryEntry[]): void {
    const root = getWorkspaceRoot();
    if (!root) {
        return;
    }
    const key = String(sessionId || '').trim();
    if (!key || !Array.isArray(entries) || entries.length === 0) {
        return;
    }
    const db = readDb(root);
    const current = Array.isArray(db.sessions[key]) ? db.sessions[key] : [];
    db.sessions[key] = trimEntries([...current, ...entries]);
    writeDb(root, db);
}

export function clearSessionMemory(sessionId?: string): { clearedSessions: number; clearedEntries: number } {
    const root = getWorkspaceRoot();
    if (!root) {
        return { clearedSessions: 0, clearedEntries: 0 };
    }
    const db = readDb(root);
    if (!sessionId) {
        const clearedSessions = Object.keys(db.sessions).length;
        const clearedEntries = Object.values(db.sessions).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0);
        db.sessions = {};
        writeDb(root, db);
        return { clearedSessions, clearedEntries };
    }
    const key = String(sessionId || '').trim();
    if (!key || !Array.isArray(db.sessions[key])) {
        return { clearedSessions: 0, clearedEntries: 0 };
    }
    const clearedEntries = db.sessions[key].length;
    delete db.sessions[key];
    writeDb(root, db);
    return { clearedSessions: 1, clearedEntries };
}

export function exportSessionMemory(sessionId?: string): string {
    const root = getWorkspaceRoot();
    if (!root) {
        return JSON.stringify({ sessions: {} }, null, 2);
    }
    const db = readDb(root);
    if (!sessionId) {
        return JSON.stringify(db, null, 2);
    }
    const key = String(sessionId || '').trim();
    const scoped = key && Array.isArray(db.sessions[key]) ? { sessions: { [key]: db.sessions[key] } } : { sessions: {} };
    return JSON.stringify(scoped, null, 2);
}

export function summarizeSessionMemory(sessionId?: string): SessionMemorySummary[] {
    const root = getWorkspaceRoot();
    if (!root) {
        return [];
    }
    const db = readDb(root);
    const target = String(sessionId || '').trim();
    const keys = target ? [target] : Object.keys(db.sessions);
    const summaries: SessionMemorySummary[] = [];
    for (const key of keys) {
        const entries = trimEntries(Array.isArray(db.sessions[key]) ? db.sessions[key] : []);
        if (!entries.length) continue;
        const lastTimestamp = entries.reduce((max, entry) => Math.max(max, Number(entry.timestamp || 0)), 0);
        summaries.push({
            sessionId: key,
            entries: entries.length,
            lastTimestamp: lastTimestamp > 0 ? lastTimestamp : undefined
        });
    }
    return summaries.sort((a, b) => Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0));
}

export function importSessionMemory(jsonText: string, mode: 'merge' | 'replace' = 'merge'): { sessions: number; entries: number } {
    const root = getWorkspaceRoot();
    if (!root) {
        return { sessions: 0, entries: 0 };
    }
    const parsed = JSON.parse(String(jsonText || '{}'));
    const incomingSessions = parsed?.sessions;
    if (!incomingSessions || typeof incomingSessions !== 'object') {
        throw new Error('Invalid session memory JSON: missing "sessions" object.');
    }

    const db = mode === 'replace' ? { sessions: {} as Record<string, SessionMemoryEntry[]> } : readDb(root);
    let sessionsCount = 0;
    let entriesCount = 0;

    for (const [sessionKey, entriesRaw] of Object.entries(incomingSessions as Record<string, any>)) {
        const key = String(sessionKey || '').trim();
        if (!key) continue;
        const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
        const normalized: SessionMemoryEntry[] = entries
            .filter((entry: any) => entry && typeof entry === 'object')
            .map((entry: any) => ({
                member: String(entry.member || '').trim() || 'member',
                role: entry.role === 'reviewer' ? 'reviewer' : 'writer',
                path: String(entry.path || '').trim(),
                contentSnippet: String(entry.contentSnippet || ''),
                timestamp: Number(entry.timestamp || Date.now())
            }));

        if (normalized.length === 0) continue;
        const current = Array.isArray(db.sessions[key]) ? db.sessions[key] : [];
        db.sessions[key] = trimEntries([...current, ...normalized]);
        sessionsCount += 1;
        entriesCount += normalized.length;
    }

    writeDb(root, db);
    return { sessions: sessionsCount, entries: entriesCount };
}

export type { SessionMemoryEntry, SessionMemorySummary };

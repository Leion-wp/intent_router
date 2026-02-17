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

export type { SessionMemoryEntry };

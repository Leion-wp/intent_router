import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { validateSafeRelativePath } from '../security';

type DbQueryArgs = {
    databasePath?: string;
    query?: string;
    paramsJson?: string;
    __meta?: {
        runId?: string;
        traceId?: string;
        stepId?: string;
    };
};

type DbWriteArgs = DbQueryArgs;

type SqlJsModule = {
    Database: new (data?: Uint8Array) => {
        run: (sql: string, params?: any) => void;
        prepare(sql: string): {
            bind: (params?: any) => void;
            step: () => boolean;
            getAsObject: () => Record<string, any>;
            getColumnNames: () => string[];
            free: () => void;
        };
        getRowsModified?: () => number;
        export: () => Uint8Array;
        close?: () => void;
    };
};

let sqlJsModulePromise: Promise<SqlJsModule> | undefined;

function resolveWorkspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return path.resolve(folder?.fsPath || folder?.path || process.cwd());
}

function emitDbLog(meta: DbQueryArgs['__meta'], text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
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

function resolveDatabasePath(rawPath: any): string {
    const workspaceRoot = resolveWorkspaceRoot();
    const value = String(rawPath || '').trim();
    if (!value) {
        throw new Error('db.query requires "databasePath".');
    }
    const candidate = path.isAbsolute(value)
        ? path.normalize(value)
        : path.resolve(workspaceRoot, value);
    validateSafeRelativePath(path.relative(workspaceRoot, candidate) || '.', workspaceRoot, workspaceRoot);
    return candidate;
}

function parseParams(raw: any): any {
    const value = String(raw || '').trim();
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
        return {};
    } catch (error: any) {
        throw new Error(`db.query paramsJson is invalid JSON: ${String(error?.message || error)}`);
    }
}

async function loadSqlJs(): Promise<SqlJsModule> {
    if (!sqlJsModulePromise) {
        sqlJsModulePromise = (async () => {
            const initSqlJs = require('sql.js');
            const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
            return await initSqlJs({
                locateFile: (file: string) => (file === 'sql-wasm.wasm' ? wasmPath : file)
            }) as SqlJsModule;
        })();
    }
    return sqlJsModulePromise;
}

export function registerDbProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.dbQuery', async (args: any) => {
        return await executeDbQueryCommand(args);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.dbWrite', async (args: any) => {
        return await executeDbWriteCommand(args);
    }));

    registerCapabilities({
        provider: 'db',
        type: 'vscode',
        capabilities: [
            {
                capability: 'db.query',
                command: 'intentRouter.internal.dbQuery',
                description: 'Execute a SQLite query against a local database file',
                determinism: 'deterministic',
                args: [
                    { name: 'databasePath', type: 'path', description: 'SQLite database file path', required: true },
                    { name: 'query', type: 'string', description: 'SQL query to execute', required: true },
                    { name: 'paramsJson', type: 'string', description: 'Optional JSON object or array of parameters', default: '{}' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the JSON response' }
                ]
            },
            {
                capability: 'db.write',
                command: 'intentRouter.internal.dbWrite',
                description: 'Execute a SQLite write against a local database file and persist changes',
                determinism: 'deterministic',
                args: [
                    { name: 'databasePath', type: 'path', description: 'SQLite database file path', required: true },
                    { name: 'query', type: 'string', description: 'SQL mutation to execute', required: true },
                    { name: 'paramsJson', type: 'string', description: 'Optional JSON object or array of parameters', default: '{}' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store the JSON response' }
                ]
            }
        ]
    });
}

export async function executeDbQueryCommand(args: DbQueryArgs): Promise<{ content: string; data: any; status: number; statusText: string }> {
    const databasePath = resolveDatabasePath(args?.databasePath);
    const query = String(args?.query || '').trim();
    if (!query) {
        throw new Error('db.query requires "query".');
    }

    const params = parseParams(args?.paramsJson);
    if (!fs.existsSync(databasePath)) {
        throw new Error(`Database file not found: ${databasePath}`);
    }

    emitDbLog(args?.__meta, `[db.query] database=${databasePath}`);
    emitDbLog(args?.__meta, `[db.query] sql=${query}`);

    const sqlJs = await loadSqlJs();
    const data = fs.readFileSync(databasePath);
    const db = new sqlJs.Database(new Uint8Array(data));

    try {
        const statement = db.prepare(query);
        let columns: string[] = [];
        const rows: Array<Record<string, any>> = [];

        try {
            statement.bind(params);
            columns = statement.getColumnNames();
            while (statement.step()) {
                rows.push(statement.getAsObject());
            }
        } finally {
            statement.free();
        }

        const payload = {
            databasePath,
            query,
            params,
            rowCount: rows.length,
            columns,
            rows
        };

        emitDbLog(args?.__meta, `[db.query] rows=${payload.rowCount}`);

        return {
            content: JSON.stringify(payload),
            data: payload,
            status: 200,
            statusText: 'OK'
        };
    } catch (error: any) {
        emitDbLog(args?.__meta, `[db.query] error=${String(error?.message || error)}`, 'stderr');
        throw error;
    } finally {
        db.close?.();
    }
}

export async function executeDbWriteCommand(args: DbWriteArgs): Promise<{ content: string; data: any; status: number; statusText: string }> {
    const databasePath = resolveDatabasePath(args?.databasePath);
    const query = String(args?.query || '').trim();
    if (!query) {
        throw new Error('db.write requires "query".');
    }

    const params = parseParams(args?.paramsJson);
    const existedBefore = fs.existsSync(databasePath);
    emitDbLog(args?.__meta, `[db.write] database=${databasePath}`);
    emitDbLog(args?.__meta, `[db.write] sql=${query}`);

    const sqlJs = await loadSqlJs();
    const db = existedBefore
        ? new sqlJs.Database(new Uint8Array(fs.readFileSync(databasePath)))
        : new sqlJs.Database();

    try {
        db.run(query, params);
        const rowsModified = typeof db.getRowsModified === 'function' ? db.getRowsModified() : undefined;
        const exported = db.export();
        fs.writeFileSync(databasePath, Buffer.from(exported));

        const payload = {
            databasePath,
            query,
            params,
            created: !existedBefore,
            rowsModified,
            persistedBytes: exported.length,
            executedAt: new Date().toISOString()
        };

        emitDbLog(args?.__meta, `[db.write] rowsModified=${typeof rowsModified === 'number' ? rowsModified : 'unknown'}`);

        return {
            content: JSON.stringify(payload),
            data: payload,
            status: existedBefore ? 200 : 201,
            statusText: existedBefore ? 'OK' : 'Created'
        };
    } catch (error: any) {
        emitDbLog(args?.__meta, `[db.write] error=${String(error?.message || error)}`, 'stderr');
        throw error;
    } finally {
        db.close?.();
    }
}

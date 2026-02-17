import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { readPipelineFromUri, runPipelineFromData, PipelineFile, ensurePipelineFolder } from './pipelineRunner';

type TriggerKind = 'cron' | 'webhook' | 'watch';

type TriggerContext = {
    kind: TriggerKind;
    triggerStepId: string;
    event?: Record<string, any>;
    chainDepth: number;
};

type TriggerRegistration = {
    id: string;
    kind: TriggerKind;
    pipelineUri: vscode.Uri;
    stepId: string;
    payload: any;
    dispose: () => void;
    onWebhook?: (method: string, body: string, headers: http.IncomingHttpHeaders) => Promise<{ statusCode: number; body: string }>;
};

const DEFAULT_COOLDOWN_MS = 2500;
const DEFAULT_WATCH_DEBOUNCE_MS = 800;
const DEFAULT_WEBHOOK_PORT = 7781;
const DEFAULT_CHAIN_DEPTH = 4;

function asBoolean(value: any, fallback = true): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
}

function asPositiveInt(value: any, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function normalizeWebhookPath(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
}

function parseWatchEvents(raw: any): Set<'create' | 'change' | 'delete'> {
    const text = String(raw || 'change').trim().toLowerCase();
    const parts = text.split(',').map(entry => entry.trim()).filter(Boolean);
    const output = new Set<'create' | 'change' | 'delete'>();
    for (const part of parts) {
        if (part === 'create' || part === 'change' || part === 'delete') {
            output.add(part);
        }
    }
    if (!output.size) output.add('change');
    return output;
}

function resolveCronIntervalMs(payload: any): number | undefined {
    const intervalMs = asPositiveInt(payload?.intervalMs, 0);
    if (intervalMs > 0) return intervalMs;

    const everyMinutes = asPositiveInt(payload?.everyMinutes, 0);
    if (everyMinutes > 0) return everyMinutes * 60_000;

    const everyHours = asPositiveInt(payload?.everyHours, 0);
    if (everyHours > 0) return everyHours * 60 * 60_000;

    const rawCron = String(payload?.cron || '').trim();
    if (!rawCron) return undefined;

    const minuteInterval = rawCron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    if (minuteInterval) {
        return asPositiveInt(minuteInterval[1], 1) * 60_000;
    }

    const hourInterval = rawCron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
    if (hourInterval) {
        return asPositiveInt(hourInterval[1], 1) * 60 * 60_000;
    }

    return undefined;
}

function normalizePipelinePathInput(raw: any): string {
    return String(raw || '').trim().replace(/\\/g, '/');
}

function resolvePipelineUriFromRef(workspaceRoot: string, pipelineRef: string): vscode.Uri {
    const normalized = normalizePipelinePathInput(pipelineRef);
    if (!normalized) {
        throw new Error('Empty pipeline reference.');
    }
    const absolute = path.isAbsolute(normalized)
        ? normalized
        : path.join(workspaceRoot, normalized);
    return vscode.Uri.file(path.normalize(absolute));
}

export class RuntimeTriggerManager implements vscode.Disposable {
    private readonly registrations = new Map<string, TriggerRegistration>();
    private readonly byWebhookPath = new Map<string, TriggerRegistration[]>();
    private readonly cooldownByRegistration = new Map<string, number>();
    private readonly watcherDebounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly disposables: vscode.Disposable[] = [];
    private webhookServer: http.Server | undefined;
    private isRefreshing = false;
    private refreshPending = false;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async start(): Promise<void> {
        const enabled = vscode.workspace.getConfiguration('intentRouter').get<boolean>('runtime.triggers.enabled', true);
        if (!enabled) return;
        await this.refresh();
        this.registerWatchers();
    }

    async refresh(): Promise<void> {
        if (this.isRefreshing) {
            this.refreshPending = true;
            return;
        }
        this.isRefreshing = true;
        try {
            this.clearRegistrations();
            await this.loadRegistrations();
            await this.ensureWebhookServer();
        } finally {
            this.isRefreshing = false;
            if (this.refreshPending) {
                this.refreshPending = false;
                await this.refresh();
            }
        }
    }

    dispose(): void {
        this.clearRegistrations();
        if (this.webhookServer) {
            try { this.webhookServer.close(); } catch { /* noop */ }
            this.webhookServer = undefined;
        }
        for (const timer of this.watcherDebounceTimers.values()) {
            clearTimeout(timer);
        }
        this.watcherDebounceTimers.clear();
        for (const disposable of this.disposables) {
            try { disposable.dispose(); } catch { /* noop */ }
        }
        this.disposables.length = 0;
    }

    private registerWatchers(): void {
        const fsWatcher = vscode.workspace.createFileSystemWatcher('**/pipeline/*.intent.json');
        const scheduleRefresh = () => {
            void this.refresh();
        };
        fsWatcher.onDidCreate(scheduleRefresh);
        fsWatcher.onDidChange(scheduleRefresh);
        fsWatcher.onDidDelete(scheduleRefresh);
        this.disposables.push(fsWatcher);

        const cfgWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
            if (
                event.affectsConfiguration('intentRouter.runtime.triggers.enabled') ||
                event.affectsConfiguration('intentRouter.runtime.triggers.webhookPort') ||
                event.affectsConfiguration('intentRouter.runtime.triggers.maxChainDepth')
            ) {
                void this.refresh();
            }
        });
        this.disposables.push(cfgWatcher);
    }

    private clearRegistrations(): void {
        for (const registration of this.registrations.values()) {
            try { registration.dispose(); } catch { /* noop */ }
        }
        this.registrations.clear();
        this.byWebhookPath.clear();
        this.cooldownByRegistration.clear();
    }

    private async loadRegistrations(): Promise<void> {
        const folder = await ensurePipelineFolder();
        if (!folder) return;
        const files = await vscode.workspace.findFiles('pipeline/*.intent.json');
        for (const uri of files) {
            const pipeline = await readPipelineFromUri(uri);
            if (!pipeline?.steps?.length) continue;
            pipeline.steps.forEach((step, stepIndex) => {
                const intent = String(step?.intent || '').trim();
                if (!intent.startsWith('system.trigger.')) return;
                const stepId = String(step?.id || '').trim() || `trigger_${stepIndex}`;
                const payload = step?.payload || {};
                if (!asBoolean(payload?.enabled, true)) return;
                if (intent === 'system.trigger.cron') {
                    this.registerCronTrigger(uri, stepId, payload);
                    return;
                }
                if (intent === 'system.trigger.watch') {
                    this.registerWatchTrigger(uri, stepId, payload);
                    return;
                }
                if (intent === 'system.trigger.webhook') {
                    this.registerWebhookTrigger(uri, stepId, payload);
                }
            });
        }
    }

    private registrationId(kind: TriggerKind, uri: vscode.Uri, stepId: string): string {
        return `${kind}:${uri.toString()}:${stepId}`;
    }

    private shouldCooldown(registrationId: string, payload: any): boolean {
        const now = Date.now();
        const cooldownMs = asPositiveInt(payload?.cooldownMs, DEFAULT_COOLDOWN_MS);
        const last = this.cooldownByRegistration.get(registrationId) || 0;
        if (now - last < cooldownMs) {
            return true;
        }
        this.cooldownByRegistration.set(registrationId, now);
        return false;
    }

    private registerCronTrigger(uri: vscode.Uri, stepId: string, payload: any): void {
        const intervalMs = resolveCronIntervalMs(payload);
        if (!intervalMs || intervalMs <= 0) return;
        const id = this.registrationId('cron', uri, stepId);
        const timer = setInterval(() => {
            if (this.shouldCooldown(id, payload)) return;
            void this.invokeTrigger(uri, stepId, payload, {
                kind: 'cron',
                triggerStepId: stepId,
                chainDepth: 0,
                event: {
                    timestamp: Date.now(),
                    intervalMs
                }
            });
        }, intervalMs);
        const dispose = () => clearInterval(timer);
        this.registrations.set(id, { id, kind: 'cron', pipelineUri: uri, stepId, payload, dispose });
    }

    private registerWatchTrigger(uri: vscode.Uri, stepId: string, payload: any): void {
        const glob = String(payload?.glob || '').trim();
        if (!glob) return;
        const events = parseWatchEvents(payload?.events);
        const debounceMs = asPositiveInt(payload?.debounceMs, DEFAULT_WATCH_DEBOUNCE_MS);
        const id = this.registrationId('watch', uri, stepId);
        const watcher = vscode.workspace.createFileSystemWatcher(glob);
        const emit = (changeType: 'create' | 'change' | 'delete', fileUri: vscode.Uri) => {
            if (!events.has(changeType)) return;
            if (this.shouldCooldown(id, payload)) return;
            const timerKey = `${id}:${changeType}:${fileUri.toString()}`;
            const previous = this.watcherDebounceTimers.get(timerKey);
            if (previous) clearTimeout(previous);
            const timer = setTimeout(() => {
                this.watcherDebounceTimers.delete(timerKey);
                void this.invokeTrigger(uri, stepId, payload, {
                    kind: 'watch',
                    triggerStepId: stepId,
                    chainDepth: 0,
                    event: {
                        changeType,
                        path: fileUri.fsPath,
                        uri: fileUri.toString(),
                        timestamp: Date.now()
                    }
                });
            }, debounceMs);
            this.watcherDebounceTimers.set(timerKey, timer);
        };
        watcher.onDidCreate((fileUri) => emit('create', fileUri));
        watcher.onDidChange((fileUri) => emit('change', fileUri));
        watcher.onDidDelete((fileUri) => emit('delete', fileUri));
        const dispose = () => watcher.dispose();
        this.registrations.set(id, { id, kind: 'watch', pipelineUri: uri, stepId, payload, dispose });
    }

    private registerWebhookTrigger(uri: vscode.Uri, stepId: string, payload: any): void {
        const pathKey = normalizeWebhookPath(payload?.path);
        const method = String(payload?.method || 'POST').trim().toUpperCase();
        const secret = String(payload?.secret || '').trim();
        const id = this.registrationId('webhook', uri, stepId);
        const registration: TriggerRegistration = {
            id,
            kind: 'webhook',
            pipelineUri: uri,
            stepId,
            payload,
            dispose: () => {
                const list = this.byWebhookPath.get(pathKey) || [];
                this.byWebhookPath.set(pathKey, list.filter(entry => entry.id !== id));
            },
            onWebhook: async (requestMethod, body, headers) => {
                if (requestMethod.toUpperCase() !== method) {
                    return { statusCode: 405, body: 'Method Not Allowed' };
                }
                if (secret) {
                    const incomingSecret = String(headers['x-leion-secret'] || '').trim();
                    if (incomingSecret !== secret) {
                        return { statusCode: 401, body: 'Unauthorized' };
                    }
                }
                if (this.shouldCooldown(id, payload)) {
                    return { statusCode: 429, body: 'Cooldown' };
                }
                let parsedBody: any = body;
                if (body) {
                    try {
                        parsedBody = JSON.parse(body);
                    } catch {
                        parsedBody = body;
                    }
                }
                void this.invokeTrigger(uri, stepId, payload, {
                    kind: 'webhook',
                    triggerStepId: stepId,
                    chainDepth: 0,
                    event: {
                        method,
                        headers,
                        body: parsedBody,
                        timestamp: Date.now()
                    }
                });
                return { statusCode: 202, body: 'Accepted' };
            }
        };
        this.registrations.set(id, registration);
        const list = this.byWebhookPath.get(pathKey) || [];
        list.push(registration);
        this.byWebhookPath.set(pathKey, list);
    }

    private async ensureWebhookServer(): Promise<void> {
        if (!this.byWebhookPath.size) {
            if (this.webhookServer) {
                try { this.webhookServer.close(); } catch { /* noop */ }
                this.webhookServer = undefined;
            }
            return;
        }

        const port = asPositiveInt(
            vscode.workspace.getConfiguration('intentRouter').get<number>('runtime.triggers.webhookPort', DEFAULT_WEBHOOK_PORT),
            DEFAULT_WEBHOOK_PORT
        );

        if (this.webhookServer) {
            const currentPort = Number((this.webhookServer.address() as any)?.port || 0);
            if (currentPort === port) return;
            try { this.webhookServer.close(); } catch { /* noop */ }
            this.webhookServer = undefined;
        }

        this.webhookServer = http.createServer((req, res) => {
            const requestUrl = req.url || '/';
            const pathname = requestUrl.split('?')[0] || '/';
            const handlers = this.byWebhookPath.get(pathname) || [];
            if (!handlers.length) {
                res.writeHead(404, { 'content-type': 'text/plain' });
                res.end('Not Found');
                return;
            }
            const chunks: Buffer[] = [];
            req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            req.on('end', async () => {
                const body = Buffer.concat(chunks).toString('utf8');
                for (const handler of handlers) {
                    const result = await handler.onWebhook?.(String(req.method || 'GET'), body, req.headers);
                    if (!result) continue;
                    if (result.statusCode === 405) {
                        continue;
                    }
                    res.writeHead(result.statusCode, { 'content-type': 'text/plain' });
                    res.end(result.body);
                    return;
                }
                res.writeHead(405, { 'content-type': 'text/plain' });
                res.end('Method Not Allowed');
            });
        });

        await new Promise<void>((resolve, reject) => {
            this.webhookServer!.once('error', reject);
            this.webhookServer!.listen(port, '127.0.0.1', () => {
                this.webhookServer?.off('error', reject);
                resolve();
            });
        });
    }

    private buildRuntimeVariables(trigger: TriggerContext): Record<string, string> {
        const vars: Record<string, string> = {
            trigger_source: trigger.kind,
            trigger_step_id: trigger.triggerStepId
        };
        if (!trigger.event) return vars;
        vars.trigger_event_json = JSON.stringify(trigger.event);
        const pairs: Array<[string, any]> = Object.entries(trigger.event);
        for (const [key, value] of pairs) {
            if (value === undefined || value === null) continue;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                vars[`trigger_${key}`] = String(value);
            }
        }
        return vars;
    }

    private async invokeTrigger(
        pipelineUri: vscode.Uri,
        stepId: string,
        payload: any,
        triggerContext: TriggerContext
    ): Promise<void> {
        const pipeline = await readPipelineFromUri(pipelineUri);
        if (!pipeline) return;
        const runtimeVars = this.buildRuntimeVariables(triggerContext);
        const result = await runPipelineFromData(
            pipeline as PipelineFile,
            false,
            stepId,
            {
                source: triggerContext.kind,
                triggerStepId: stepId,
                runtimeVariables: runtimeVars
            }
        );

        if (!result.success) return;
        const nextPipelineRef = String(payload?.onSuccessPipeline || '').trim();
        if (!nextPipelineRef) return;

        const maxDepth = asPositiveInt(
            vscode.workspace.getConfiguration('intentRouter').get<number>('runtime.triggers.maxChainDepth', DEFAULT_CHAIN_DEPTH),
            DEFAULT_CHAIN_DEPTH
        );
        if (triggerContext.chainDepth >= maxDepth) return;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) return;

        try {
            const nextUri = resolvePipelineUriFromRef(workspaceRoot, nextPipelineRef);
            const nextPipeline = await readPipelineFromUri(nextUri);
            if (!nextPipeline) return;
            await runPipelineFromData(
                nextPipeline as PipelineFile,
                false,
                undefined,
                {
                    source: 'manual',
                    triggerStepId: stepId,
                    runtimeVariables: {
                        ...runtimeVars,
                        trigger_chain_from: pipelineUri.fsPath,
                        trigger_chain_depth: String(triggerContext.chainDepth + 1)
                    }
                }
            );
        } catch {
            // best effort
        }
    }
}

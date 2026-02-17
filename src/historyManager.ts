import * as vscode from 'vscode';
import { pipelineEventBus, PipelineEvent } from './eventBus';
import { ensurePipelineFolder } from './pipelineRunner';

export interface StepLog {
    index: number;
    stepId?: string;
    intentId: string;
    description?: string;
    status: 'pending' | 'running' | 'success' | 'failure';
    startTime: number;
    endTime?: number;
    error?: string;
}

export interface PipelineRun {
    id: string;
    name: string;
    timestamp: number;
    status: 'running' | 'success' | 'failure' | 'cancelled';
    steps: StepLog[];
    pullRequests?: Array<{
        provider: 'github';
        url: string;
        number?: number;
        state?: 'open' | 'closed' | 'merged';
        isDraft?: boolean;
        head: string;
        base: string;
        title: string;
        stepId?: string;
        timestamp: number;
    }>;
    pipelineSnapshot?: any; // Store the full pipeline definition
}

export class HistoryManager {
    private runs: PipelineRun[] = [];
    private currentRun: PipelineRun | null = null;
    private readonly FILE_NAME = 'history.json';
    private historyUri: vscode.Uri | undefined;
    private ready: Promise<void>;

    constructor() {
        this.ready = this.initialize();
        this.registerListeners();
    }

    public whenReady(): Promise<void> {
        return this.ready;
    }

    private async initialize() {
        const folder = await ensurePipelineFolder();
        if (folder) {
            this.historyUri = vscode.Uri.joinPath(folder, this.FILE_NAME);
            await this.loadHistory();
        }
    }

    private async loadHistory() {
        if (!this.historyUri) return;
        try {
            const bytes = await vscode.workspace.fs.readFile(this.historyUri);
            const content = Buffer.from(bytes).toString('utf8');
            this.runs = JSON.parse(content);
        } catch (e) {
            // File might not exist or be invalid, start fresh
            this.runs = [];
        }
    }

    private async saveHistory() {
        if (!this.historyUri) return;
        try {
            const content = JSON.stringify(this.runs, null, 2);
            await vscode.workspace.fs.writeFile(this.historyUri, Buffer.from(content, 'utf8'));
        } catch (e) {
            console.error('Failed to save history:', e);
        }
    }

    public getHistory(): PipelineRun[] {
        return this.runs;
    }

    private getMaxRuns(): number {
        const cfg = vscode.workspace.getConfiguration('intentRouter');
        const raw = cfg.get<number>('history.maxRuns', 50);
        const maxRuns = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 50;
        return Math.min(maxRuns, 500);
    }

    private getSnapshotMode(): 'full' | 'minimal' | 'none' {
        const cfg = vscode.workspace.getConfiguration('intentRouter');
        const mode = cfg.get<string>('history.snapshotMode', 'full');
        if (mode === 'minimal' || mode === 'none' || mode === 'full') {
            return mode;
        }
        return 'full';
    }

    private buildSnapshot(event: Extract<PipelineEvent, { type: 'pipelineStart' }>): any | undefined {
        const mode = this.getSnapshotMode();
        if (mode === 'none') {
            return undefined;
        }

        const pipeline = event.pipeline;
        if (!pipeline) {
            return undefined;
        }

        if (mode === 'full') {
            return pipeline;
        }

        // minimal: store only what's needed for visual restore (meta.ui)
        const ui = pipeline?.meta?.ui;
        if (!ui) {
            return undefined;
        }
        return {
            name: pipeline?.name ?? event.name ?? 'Untitled Pipeline',
            meta: { ui }
        };
    }

    private registerListeners() {
        pipelineEventBus.on(this.handleEvent.bind(this));
    }

    public async clearHistory() {
        this.runs = [];
        await this.saveHistory();
        vscode.window.showInformationMessage('Pipeline history cleared.');
        // We might need to notify the webview if it's open.
        // For now, next refresh will show empty.
    }

    private handleEvent(event: PipelineEvent) {
        switch (event.type) {
            case 'pipelineStart':
                this.currentRun = {
                    id: event.runId,
                    name: event.name || 'Untitled Pipeline',
                    timestamp: event.timestamp,
                    status: 'running',
                    steps: [],
                    pipelineSnapshot: this.buildSnapshot(event)
                };
                // Add to start of list
                this.runs.unshift(this.currentRun);
                const maxRuns = this.getMaxRuns();
                if (this.runs.length > maxRuns) {
                    this.runs = this.runs.slice(0, maxRuns);
                }
                this.saveHistory();
                break;

            case 'stepStart':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    this.currentRun.steps.push({
                        index: event.index ?? -1,
                        stepId: event.stepId,
                        intentId: event.intentId,
                        description: event.description,
                        status: 'running',
                        startTime: event.timestamp
                    });
                }
                break;

            case 'stepEnd':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    const step = this.currentRun.steps.find(s => s.intentId === event.intentId);
                    if (step) {
                        step.status = event.success ? 'success' : 'failure';
                        step.endTime = event.timestamp;
                    }
                    // Autosave on step completion? Maybe too frequent.
                }
                break;

            case 'githubPullRequestCreated':
                if (this.currentRun && (!event.runId || this.currentRun.id === event.runId)) {
                    const list = this.currentRun.pullRequests || (this.currentRun.pullRequests = []);
                    list.push({
                        provider: 'github',
                        url: event.url,
                        number: event.number,
                        state: event.state,
                        isDraft: event.isDraft,
                        head: event.head,
                        base: event.base,
                        title: event.title,
                        stepId: event.stepId,
                        timestamp: Date.now()
                    });
                    this.saveHistory();
                }
                break;

            case 'pipelineEnd':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    // Use explicit status if available, otherwise infer from success boolean
                    if (event.status) {
                        this.currentRun.status = event.status;
                    } else {
                        this.currentRun.status = event.success ? 'success' : 'failure';
                    }
                    this.saveHistory();
                    this.currentRun = null;
                }
                break;

            case 'pipelinePause':
                // Could update status to 'paused' if we wanted
                break;

            case 'pipelineResume':
                // Resume
                break;
        }
    }
}

export const historyManager = new HistoryManager();

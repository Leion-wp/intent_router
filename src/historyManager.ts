import * as vscode from 'vscode';
import { pipelineEventBus, PipelineEvent } from './eventBus';
import { ensurePipelineFolder } from './pipelineRunner';

export interface StepLog {
    index: number;
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
}

export class HistoryManager {
    private runs: PipelineRun[] = [];
    private currentRun: PipelineRun | null = null;
    private readonly MAX_RUNS = 50;
    private readonly FILE_NAME = 'history.json';
    private historyUri: vscode.Uri | undefined;

    constructor() {
        this.initialize();
        this.registerListeners();
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

    private registerListeners() {
        pipelineEventBus.on(this.handleEvent.bind(this));
    }

    private handleEvent(event: PipelineEvent) {
        switch (event.type) {
            case 'pipelineStart':
                this.currentRun = {
                    id: event.runId,
                    name: event.name || 'Untitled Pipeline',
                    timestamp: event.timestamp,
                    status: 'running',
                    steps: []
                };
                // Add to start of list
                this.runs.unshift(this.currentRun);
                if (this.runs.length > this.MAX_RUNS) {
                    this.runs.pop();
                }
                this.saveHistory();
                break;

            case 'stepStart':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    this.currentRun.steps.push({
                        index: event.index ?? -1,
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

            case 'pipelineEnd':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    this.currentRun.status = event.success ? 'success' : 'failure';
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

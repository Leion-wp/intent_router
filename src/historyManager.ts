import * as vscode from 'vscode';
import { pipelineEventBus, PipelineEvent } from './eventBus';
import { ensurePipelineFolder } from './pipelineRunner';

export interface StepLog {
    index: number;
    stepId?: string;
    intentId: string;
    intent?: string;
    description?: string;
    status: 'pending' | 'running' | 'success' | 'failure';
    startTime: number;
    endTime?: number;
    error?: string;
}

export interface RunAuditTimelineEntry {
    timestamp: number;
    type: string;
    level: 'info' | 'warn' | 'error';
    stepId?: string;
    intentId?: string;
    message: string;
    data?: any;
}

export interface RunAuditData {
    timeline: RunAuditTimelineEntry[];
    hitl: Array<{
        timestamp: number;
        nodeId?: string;
        stepId?: string;
        decision: 'approve' | 'reject';
        approvedPaths?: string[];
    }>;
    reviews: Array<{
        timestamp: number;
        stepId?: string;
        files: Array<{ path: string; added: number; removed: number }>;
        totalAdded: number;
        totalRemoved: number;
        diffSignature?: string;
        policyMode?: 'warn' | 'block';
        policyBlocked?: boolean;
        policyViolations?: string[];
    }>;
    cost: {
        estimatedTotal: number;
        byIntent: Record<string, number>;
    };
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
    audit?: RunAuditData;
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

    public buildRunAuditExport(runId: string): any | undefined {
        const normalizedRunId = String(runId || '').trim();
        if (!normalizedRunId) return undefined;
        const run = this.runs.find((entry) => String(entry.id) === normalizedRunId);
        if (!run) return undefined;
        return {
            runId: run.id,
            name: run.name,
            status: run.status,
            timestamp: run.timestamp,
            pullRequests: run.pullRequests || [],
            steps: run.steps || [],
            audit: run.audit || {
                timeline: [],
                hitl: [],
                reviews: [],
                cost: {
                    estimatedTotal: 0,
                    byIntent: {}
                }
            }
        };
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
        const appendTimeline = (entry: RunAuditTimelineEntry) => {
            if (!this.currentRun) return;
            if (!this.currentRun.audit) {
                this.currentRun.audit = {
                    timeline: [],
                    hitl: [],
                    reviews: [],
                    cost: { estimatedTotal: 0, byIntent: {} }
                };
            }
            this.currentRun.audit.timeline.push(entry);
        };

        const ensureCost = () => {
            if (!this.currentRun) return;
            if (!this.currentRun.audit) {
                this.currentRun.audit = {
                    timeline: [],
                    hitl: [],
                    reviews: [],
                    cost: { estimatedTotal: 0, byIntent: {} }
                };
            }
        };

        const estimateStepCost = (intent?: string): number => {
            const key = String(intent || '').trim().toLowerCase();
            if (!key) return 0;
            if (key.startsWith('ai.team')) return 2.0;
            if (key.startsWith('ai.generate')) return 1.0;
            if (key.startsWith('http.request')) return 0.2;
            if (key.startsWith('github.openpr')) return 0.1;
            return 0;
        };

        switch (event.type) {
            case 'pipelineStart':
                this.currentRun = {
                    id: event.runId,
                    name: event.name || 'Untitled Pipeline',
                    timestamp: event.timestamp,
                    status: 'running',
                    steps: [],
                    pipelineSnapshot: this.buildSnapshot(event),
                    audit: {
                        timeline: [],
                        hitl: [],
                        reviews: [],
                        cost: { estimatedTotal: 0, byIntent: {} }
                    }
                };
                appendTimeline({
                    timestamp: event.timestamp,
                    type: 'pipeline.start',
                    level: 'info',
                    message: `Pipeline started: ${this.currentRun.name}`
                });
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
                        intent: event.intent,
                        description: event.description,
                        status: 'running',
                        startTime: event.timestamp
                    });
                    appendTimeline({
                        timestamp: event.timestamp,
                        type: 'step.start',
                        level: 'info',
                        stepId: event.stepId,
                        intentId: event.intentId,
                        message: `Step started: ${event.stepId || event.intentId}`,
                        data: { intent: event.intent, description: event.description }
                    });
                }
                break;

            case 'stepEnd':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    const step = this.currentRun.steps.find(s => s.intentId === event.intentId);
                    if (step) {
                        step.status = event.success ? 'success' : 'failure';
                        step.endTime = event.timestamp;
                        if (event.success) {
                            ensureCost();
                            const intentKey = String(step.intent || '').trim().toLowerCase();
                            const cost = estimateStepCost(step.intent);
                            if (cost > 0 && this.currentRun.audit) {
                                this.currentRun.audit.cost.estimatedTotal += cost;
                                this.currentRun.audit.cost.byIntent[intentKey] = (this.currentRun.audit.cost.byIntent[intentKey] || 0) + cost;
                            }
                        }
                    }
                    appendTimeline({
                        timestamp: event.timestamp,
                        type: 'step.end',
                        level: event.success ? 'info' : 'error',
                        stepId: event.stepId,
                        intentId: event.intentId,
                        message: `Step ${event.success ? 'succeeded' : 'failed'}: ${event.stepId || event.intentId}`
                    });
                    // Autosave on step completion? Maybe too frequent.
                }
                break;

            case 'stepLog':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    appendTimeline({
                        timestamp: Date.now(),
                        type: 'step.log',
                        level: event.stream === 'stderr' ? 'warn' : 'info',
                        stepId: event.stepId,
                        intentId: event.intentId,
                        message: String(event.text || '').trim().slice(0, 280)
                    });
                }
                break;

            case 'approvalReviewReady':
                if (this.currentRun && this.currentRun.id === event.runId) {
                    ensureCost();
                    this.currentRun.audit?.reviews.push({
                        timestamp: Date.now(),
                        stepId: event.stepId,
                        files: event.files,
                        totalAdded: event.totalAdded,
                        totalRemoved: event.totalRemoved,
                        diffSignature: event.diffSignature,
                        policyMode: event.policyMode,
                        policyBlocked: event.policyBlocked,
                        policyViolations: event.policyViolations
                    });
                    appendTimeline({
                        timestamp: Date.now(),
                        type: 'approval.reviewReady',
                        level: event.policyBlocked ? 'error' : 'info',
                        stepId: event.stepId,
                        intentId: event.intentId,
                        message: `Review ready: ${event.files.length} file(s), +${event.totalAdded}/-${event.totalRemoved}`,
                        data: {
                            diffSignature: event.diffSignature,
                            policyMode: event.policyMode,
                            policyBlocked: event.policyBlocked
                        }
                    });
                }
                break;

            case 'pipelineDecision':
                if (this.currentRun && (!event.runId || this.currentRun.id === event.runId)) {
                    ensureCost();
                    this.currentRun.audit?.hitl.push({
                        timestamp: Date.now(),
                        nodeId: event.nodeId,
                        stepId: event.nodeId,
                        decision: event.decision,
                        approvedPaths: event.approvedPaths
                    });
                    appendTimeline({
                        timestamp: Date.now(),
                        type: 'hitl.decision',
                        level: event.decision === 'approve' ? 'info' : 'warn',
                        stepId: event.nodeId,
                        message: `HITL decision: ${event.decision.toUpperCase()} (${(event.approvedPaths || []).length} approved paths)`,
                        data: { approvedPaths: event.approvedPaths || [] }
                    });
                }
                break;

            case 'pipelineReviewOpenDiff':
                if (this.currentRun && (!event.runId || this.currentRun.id === event.runId)) {
                    appendTimeline({
                        timestamp: Date.now(),
                        type: 'approval.openDiff',
                        level: 'info',
                        stepId: event.nodeId,
                        message: `Diff opened${event.path ? `: ${event.path}` : ''}`
                    });
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
                    appendTimeline({
                        timestamp: Date.now(),
                        type: 'github.prCreated',
                        level: 'info',
                        stepId: event.stepId,
                        intentId: event.intentId,
                        message: `PR created: ${event.title}`,
                        data: {
                            url: event.url,
                            number: event.number,
                            state: event.state,
                            isDraft: event.isDraft,
                            head: event.head,
                            base: event.base
                        }
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
                    appendTimeline({
                        timestamp: event.timestamp,
                        type: 'pipeline.end',
                        level: event.success ? 'info' : 'error',
                        message: `Pipeline ended: ${String(this.currentRun.status).toUpperCase()}`,
                        data: {
                            estimatedCost: this.currentRun.audit?.cost?.estimatedTotal || 0
                        }
                    });
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

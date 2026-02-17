import * as vscode from 'vscode';

export type PipelineEvent =
    | { type: 'pipelineStart'; runId: string; timestamp: number; totalSteps?: number; name?: string; pipeline?: any }
    | { type: 'pipelineEnd'; runId: string; timestamp: number; success: boolean; status?: 'success' | 'failure' | 'cancelled' }
    | { type: 'stepStart'; runId: string; intentId: string; timestamp: number; description?: string; index?: number; stepId?: string }
    | { type: 'stepEnd'; runId: string; intentId: string; timestamp: number; success: boolean; index?: number; stepId?: string }
    | { type: 'stepLog'; runId: string; intentId: string; stepId?: string; text: string; stream: 'stdout' | 'stderr' }
    | {
        type: 'approvalReviewReady';
        runId: string;
        intentId: string;
        stepId?: string;
        files: Array<{ path: string; added: number; removed: number }>;
        totalAdded: number;
        totalRemoved: number;
        policyMode?: 'warn' | 'block';
        policyBlocked?: boolean;
        policyViolations?: string[];
    }
    | {
        type: 'teamRunSummary';
        runId: string;
        intentId: string;
        stepId?: string;
        strategy: 'sequential' | 'reviewer_gate' | 'vote';
        winnerMember?: string;
        winnerReason?: string;
        voteScoreByMember?: Array<{ member: string; role: 'writer' | 'reviewer'; weight: number; score: number }>;
        members: Array<{ name: string; role: 'writer' | 'reviewer'; path: string; files: number }>;
        totalFiles: number;
    }
    | {
        type: 'githubPullRequestCreated';
        runId?: string;
        intentId?: string;
        stepId?: string;
        provider: 'github';
        url: string;
        number?: number;
        state?: 'open' | 'closed' | 'merged';
        isDraft?: boolean;
        head: string;
        base: string;
        title: string;
    }
    | { type: 'pipelineReviewOpenDiff'; nodeId?: string; runId?: string; path?: string }
    | { type: 'pipelinePause'; runId: string; timestamp: number }
    | { type: 'pipelineResume'; runId: string; timestamp: number };

type Listener = (event: PipelineEvent) => void;

class EventBus {
    private listeners: Listener[] = [];

    on(listener: Listener): vscode.Disposable {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter(l => l !== listener);
            }
        };
    }

    emit(event: PipelineEvent): void {
        this.listeners.forEach(l => l(event));
    }
}

export const pipelineEventBus = new EventBus();

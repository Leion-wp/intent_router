import * as vscode from 'vscode';

export type PipelineEvent =
    | { type: 'pipelineStart'; runId: string; timestamp: number; totalSteps?: number; name?: string; pipeline?: any }
    | { type: 'pipelineEnd'; runId: string; timestamp: number; success: boolean; status?: 'success' | 'failure' | 'cancelled' }
    | { type: 'stepStart'; runId: string; intentId: string; timestamp: number; description?: string; index?: number }
    | { type: 'stepEnd'; runId: string; intentId: string; timestamp: number; success: boolean; index?: number }
    | { type: 'stepLog'; runId: string; intentId: string; text: string; stream: 'stdout' | 'stderr' }
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

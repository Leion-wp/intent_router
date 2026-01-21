import * as vscode from 'vscode';

export type PipelineEvent =
    | { type: 'pipelineStart'; runId: string; timestamp: number }
    | { type: 'pipelineEnd'; runId: string; timestamp: number; success: boolean }
    | { type: 'stepStart'; runId: string; intentId: string; timestamp: number; description?: string }
    | { type: 'stepEnd'; runId: string; intentId: string; timestamp: number; success: boolean };

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

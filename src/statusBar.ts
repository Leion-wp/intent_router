import * as vscode from 'vscode';
import { pipelineEventBus, PipelineEvent } from './eventBus';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private currentStep: number = 0;
    private totalSteps: number = 0;
    private pipelineName: string = '';
    private isPaused: boolean = false;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'intentRouter.showPipelineActions';
        this.disposables.push(this.statusBarItem);

        this.disposables.push(pipelineEventBus.on(this.handleEvent.bind(this)));
    }

    private handleEvent(event: PipelineEvent) {
        switch (event.type) {
            case 'pipelineStart':
                this.currentStep = 0;
                this.totalSteps = event.totalSteps || 0;
                this.pipelineName = event.name || 'Pipeline';
                this.isPaused = false;
                this.updateStatus('Starting...');
                this.statusBarItem.show();
                break;
            case 'stepStart':
                this.currentStep = (event.index !== undefined ? event.index : this.currentStep) + 1;
                this.updateStatus(event.description || `Step ${this.currentStep}`);
                break;
            case 'stepEnd':
                // status update handled by next stepStart or pipelineEnd
                break;
            case 'pipelinePause':
                this.isPaused = true;
                this.updateStatus('Paused');
                break;
            case 'pipelineResume':
                this.isPaused = false;
                this.updateStatus('Resuming...');
                break;
            case 'pipelineEnd':
                this.statusBarItem.hide();
                this.currentStep = 0;
                this.totalSteps = 0;
                this.isPaused = false;
                break;
        }
    }

    private updateStatus(detail: string) {
        const stepInfo = this.totalSteps > 0 ? `(${this.currentStep}/${this.totalSteps})` : '';
        const icon = this.isPaused ? '$(debug-pause)' : '$(play-circle)';
        const statusText = this.isPaused ? 'PAUSED' : detail;

        this.statusBarItem.text = `${icon} ${this.pipelineName} ${stepInfo}: ${statusText}`;
        this.statusBarItem.tooltip = 'Click to Pause/Resume/Cancel';
        this.statusBarItem.backgroundColor = this.isPaused ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

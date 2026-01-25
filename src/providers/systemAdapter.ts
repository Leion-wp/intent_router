import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';
import { cancelCurrentPipeline } from '../pipelineRunner';

export function registerSystemProvider(context: vscode.ExtensionContext) {
    doRegister();

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemPause', async (args: any) => {
            await executeSystemCommand(args);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSetVar', async (_args: any) => {
            // Handled in the PipelineRunner (variable cache). Kept for direct invocation compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSetCwd', async (_args: any) => {
            // Handled in the PipelineRunner (current cwd). Kept for direct invocation compatibility.
            return;
        })
    );
}

function doRegister() {
    registerCapabilities({
        provider: 'system',
        type: 'vscode',
        capabilities: [
            {
                capability: 'system.pause',
                command: 'intentRouter.internal.systemPause',
                description: 'Pause execution for human verification',
                args: [
                    { name: 'message', type: 'string', description: 'Message to display in the modal', required: true, default: 'Pipeline paused for review.' }
                ]
            },
            {
                capability: 'system.setVar',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Set a pipeline variable for later steps',
                args: [
                    { name: 'name', type: 'string', description: 'Variable name (used by ${input:Name} / ${var:Name})', required: true },
                    { name: 'value', type: 'string', description: 'Variable value', required: true }
                ]
            },
            {
                capability: 'system.setCwd',
                command: 'intentRouter.internal.systemSetCwd',
                description: 'Set the working directory for subsequent steps',
                args: [
                    { name: 'path', type: 'path', description: 'Working directory path', required: true }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered System provider capabilities.');
}

export async function executeSystemCommand(args: any): Promise<void> {
    const message = args?.message || 'Pipeline paused for human review.';

    const selection = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Continue',
        'Cancel'
    );

    if (selection !== 'Continue') {
        cancelCurrentPipeline();
        throw new Error('Pipeline aborted by user.');
    }
}

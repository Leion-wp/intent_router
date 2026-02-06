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

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemForm', async (_args: any) => {
            // Handled in the PipelineRunner (HITL form -> variable cache). Kept for determinism/policy + compatibility.
            return;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intentRouter.internal.systemSwitch', async (_args: any) => {
            // Handled in the PipelineRunner (routing). Kept for determinism/policy + compatibility.
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
                determinism: 'interactive',
                args: [
                    { name: 'message', type: 'string', description: 'Message to display in the modal', required: true, default: 'Pipeline paused for review.' }
                ]
            },
            {
                capability: 'system.setVar',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Set a pipeline variable for later steps',
                determinism: 'deterministic',
                args: [
                    { name: 'name', type: 'string', description: 'Variable name (used by ${input:Name} / ${var:Name})', required: true },
                    { name: 'value', type: 'string', description: 'Variable value', required: true }
                ]
            },
            {
                capability: 'system.setCwd',
                command: 'intentRouter.internal.systemSetCwd',
                description: 'Set the working directory for subsequent steps',
                determinism: 'deterministic',
                args: [
                    { name: 'path', type: 'path', description: 'Working directory path', required: true }
                ]
            },
            {
                capability: 'system.form',
                command: 'intentRouter.internal.systemForm',
                description: 'Collect human inputs and store them as variables',
                determinism: 'interactive',
                args: [
                    { name: 'fields', type: 'string', description: 'JSON array of fields (handled by runner)', required: false }
                ]
            },
            {
                capability: 'system.switch',
                command: 'intentRouter.internal.systemSwitch',
                description: 'Route to a branch based on a variable value (equals match + default)',
                determinism: 'deterministic',
                args: [
                    { name: 'variableKey', type: 'string', description: 'Variable key to read', required: true },
                    { name: 'routes', type: 'string', description: 'JSON routes (handled by runner)', required: false },
                    { name: 'defaultStepId', type: 'string', description: 'Default target step id', required: true }
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

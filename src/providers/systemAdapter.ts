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
            },
            {
                capability: 'system.trigger.cron',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline on interval/cron schedule',
                determinism: 'deterministic',
                args: [
                    { name: 'cron', type: 'string', description: 'Cron expression (supports */N minutes or 0 */N hours patterns)', required: false },
                    { name: 'intervalMs', type: 'string', description: 'Interval in milliseconds', required: false },
                    { name: 'everyMinutes', type: 'string', description: 'Interval in minutes', required: false },
                    { name: 'everyHours', type: 'string', description: 'Interval in hours', required: false },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'system.trigger.webhook',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline from HTTP webhook',
                determinism: 'interactive',
                args: [
                    { name: 'path', type: 'string', description: 'Webhook path (ex: /factory/idea)', required: true },
                    { name: 'method', type: 'string', description: 'HTTP method', required: false, default: 'POST' },
                    { name: 'secret', type: 'string', description: 'Optional shared secret (x-leion-secret header)', required: false },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'system.trigger.watch',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Runtime trigger: run pipeline when files change',
                determinism: 'deterministic',
                args: [
                    { name: 'glob', type: 'string', description: 'Workspace glob pattern (ex: **/*.md)', required: true },
                    { name: 'events', type: 'string', description: 'CSV events: create,change,delete', required: false, default: 'change' },
                    { name: 'enabled', type: 'boolean', description: 'Enable trigger', required: false, default: true },
                    { name: 'debounceMs', type: 'string', description: 'Debounce delay for burst changes', required: false },
                    { name: 'cooldownMs', type: 'string', description: 'Minimum delay between runs', required: false },
                    { name: 'onSuccessPipeline', type: 'path', description: 'Optional pipeline to run after success', required: false }
                ]
            },
            {
                capability: 'memory.save',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Save run memory entry (full run, segment, variables, or raw data)',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Memory session id', required: true, default: 'default' },
                    { name: 'key', type: 'string', description: 'Memory key (logical bucket)', required: false, default: 'entry' },
                    { name: 'scope', type: 'enum', options: ['full_run', 'run_segment', 'variables', 'raw'], description: 'What to save', required: false, default: 'variables' },
                    { name: 'variableKeys', type: 'string', description: 'CSV variable keys (used by scope=variables)', required: false },
                    { name: 'stepIds', type: 'string', description: 'CSV step ids (used by scope=run_segment)', required: false },
                    { name: 'data', type: 'string', description: 'Raw data payload (used by scope=raw)', required: false },
                    { name: 'tags', type: 'string', description: 'CSV tags', required: false },
                    { name: 'outputVar', type: 'string', description: 'Variable name receiving memory entry id', required: false }
                ]
            },
            {
                capability: 'memory.recall',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Recall memory entries into variables',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Memory session id', required: true, default: 'default' },
                    { name: 'key', type: 'string', description: 'Optional memory key filter', required: false },
                    { name: 'tag', type: 'string', description: 'Optional tag filter', required: false },
                    { name: 'runId', type: 'string', description: 'Optional run id filter', required: false },
                    { name: 'limit', type: 'string', description: 'Max records', required: false, default: '5' },
                    { name: 'mode', type: 'enum', options: ['latest', 'all'], description: 'Recall mode', required: false, default: 'latest' },
                    { name: 'outputVar', type: 'string', description: 'Variable name for recalled JSON', required: false, default: 'memory_recall' },
                    { name: 'outputVarCount', type: 'string', description: 'Variable name for recalled record count', required: false },
                    { name: 'injectVars', type: 'boolean', description: 'Inject recalled variables into runtime cache', required: false, default: false },
                    { name: 'injectPrefix', type: 'string', description: 'Prefix for injected variables', required: false, default: '' },
                    { name: 'requireMatch', type: 'boolean', description: 'Fail step if recall result is empty', required: false, default: false }
                ]
            },
            {
                capability: 'memory.clear',
                command: 'intentRouter.internal.systemSetVar',
                description: 'Clear memory entries by filter',
                determinism: 'deterministic',
                args: [
                    { name: 'sessionId', type: 'string', description: 'Optional memory session id', required: false },
                    { name: 'key', type: 'string', description: 'Optional memory key', required: false },
                    { name: 'tag', type: 'string', description: 'Optional tag', required: false },
                    { name: 'runId', type: 'string', description: 'Optional run id', required: false },
                    { name: 'keepLast', type: 'string', description: 'Keep N newest matching entries', required: false, default: '0' },
                    { name: 'outputVarRemoved', type: 'string', description: 'Variable name receiving removed count', required: false },
                    { name: 'outputVarRemaining', type: 'string', description: 'Variable name receiving remaining count', required: false }
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

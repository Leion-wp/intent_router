import * as vscode from 'vscode';
import { Intent } from './types';
import { routeIntent } from './router';
import { pipelineEventBus } from './eventBus';

export type PipelineFile = {
    name: string;
    profile?: string;
    steps: Array<Intent>;
};

export async function runPipelineFromActiveEditor(dryRun: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Open a .intent.json file to run a pipeline.');
        return;
    }

    const pipeline = parsePipeline(editor.document.getText());
    if (!pipeline) {
        return;
    }

    await runPipelineFromData(pipeline, dryRun);
}

export async function runPipelineFromUri(uri: vscode.Uri, dryRun: boolean): Promise<void> {
    const pipeline = await readPipelineFromUri(uri);
    if (!pipeline) {
        return;
    }

    await runPipelineFromData(pipeline, dryRun);
}

export async function readPipelineFromUri(uri: vscode.Uri): Promise<PipelineFile | undefined> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return parsePipeline(text);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read pipeline: ${error}`);
        return undefined;
    }
}

export async function writePipelineToUri(uri: vscode.Uri, pipeline: PipelineFile): Promise<void> {
    const content = JSON.stringify(pipeline, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

export async function ensurePipelineFolder(): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'pipeline');
    await vscode.workspace.fs.createDirectory(folderUri);
    return folderUri;
}

export async function runPipelineFromData(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    await runPipeline(pipeline, dryRun);
}

function parsePipeline(text: string): PipelineFile | undefined {
    let pipeline: PipelineFile;
    try {
        pipeline = JSON.parse(text);
    } catch (error) {
        vscode.window.showErrorMessage(`Invalid pipeline JSON: ${error}`);
        return undefined;
    }

    if (!pipeline || !Array.isArray(pipeline.steps)) {
        vscode.window.showErrorMessage('Invalid pipeline: expected a "steps" array.');
        return undefined;
    }

    return pipeline;
}

async function runPipeline(pipeline: PipelineFile, dryRun: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const originalProfile = config.get<string>('activeProfile', '');
    const targetProfile = pipeline.profile ?? '';
    if (targetProfile && targetProfile !== originalProfile) {
        await config.update('activeProfile', targetProfile, true);
    }

    const variableCache = new Map<string, string>();
<<<<<<< HEAD
=======
    const runId = Date.now().toString(36); // Simple run ID

    pipelineEventBus.emit({ type: 'pipelineStart', runId, timestamp: Date.now() });
>>>>>>> a33bf10ff21be4f9648ef3a99ab51e788fbfdaf0

    try {
        for (const step of pipeline.steps) {
            const stepIntent: Intent = {
                ...step,
                description: step.description,
                meta: {
                    ...(step.meta ?? {}),
                    dryRun: dryRun ? true : step.meta?.dryRun
                }
            };

<<<<<<< HEAD
            const ok = await routeIntent(stepIntent, variableCache);
=======
            const intentId = stepIntent.meta?.traceId ?? Math.random().toString(36).substring(7);

            pipelineEventBus.emit({ type: 'stepStart', runId, intentId, timestamp: Date.now(), description: step.description });

            const ok = await routeIntent(stepIntent, variableCache);

            pipelineEventBus.emit({ type: 'stepEnd', runId, intentId, timestamp: Date.now(), success: ok });

>>>>>>> a33bf10ff21be4f9648ef3a99ab51e788fbfdaf0
            if (!ok) {
                vscode.window.showWarningMessage('Pipeline stopped on failed step.');
                pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: false });
                break;
            }
        }
        pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: true });
    } catch (e) {
        pipelineEventBus.emit({ type: 'pipelineEnd', runId, timestamp: Date.now(), success: false });
        throw e;
    } finally {
        if (targetProfile && targetProfile !== originalProfile) {
            await config.update('activeProfile', originalProfile, true);
        }
    }
}

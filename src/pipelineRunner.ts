import * as vscode from 'vscode';
import { Intent } from './types';
import { routeIntent } from './router';

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

    try {
        for (const step of pipeline.steps) {

            // Resolve variables in payload
            if (step.payload && !dryRun) {
                step.payload = await resolveVariables(step.payload, variableCache);
            }

            const stepIntent: Intent = {
                ...step,
                meta: {
                    ...(step.meta ?? {}),
                    dryRun: dryRun ? true : step.meta?.dryRun
                }
            };

            const ok = await routeIntent(stepIntent);
            if (!ok) {
                vscode.window.showWarningMessage('Pipeline stopped on failed step.');
                break;
            }
        }
    } catch (err: any) {
        // Handle explicit stop or errors
        vscode.window.showErrorMessage(`Pipeline error: ${err.message}`);
    } finally {
        if (targetProfile && targetProfile !== originalProfile) {
            await config.update('activeProfile', originalProfile, true);
        }
    }
}

async function resolveVariables(payload: any, cache: Map<string, string>): Promise<any> {
    if (typeof payload === 'string') {
        return await resolveString(payload, cache);
    }
    if (Array.isArray(payload)) {
        const resolved = [];
        for (const item of payload) {
            resolved.push(await resolveVariables(item, cache));
        }
        return resolved;
    }
    if (typeof payload === 'object' && payload !== null) {
        const resolved: any = {};
        for (const key of Object.keys(payload)) {
            resolved[key] = await resolveVariables(payload[key], cache);
        }
        return resolved;
    }
    return payload;
}

async function resolveString(text: string, cache: Map<string, string>): Promise<string> {
    const regex = /\$\{input:([^}]+)\}/g;
    let match;
    let newText = text;

    // Find all unique variables
    const matches = [];
    while ((match = regex.exec(text)) !== null) {
        matches.push({ full: match[0], prompt: match[1] });
    }

    for (const m of matches) {
        if (cache.has(m.full)) {
            newText = newText.replace(m.full, cache.get(m.full)!);
            continue;
        }

        const userInput = await vscode.window.showInputBox({
            prompt: `Pipeline Input: ${m.prompt}`,
            placeHolder: 'Enter value...'
        });

        if (userInput === undefined) {
            throw new Error('Input cancelled by user.');
        }

        cache.set(m.full, userInput);
        // Replace ALL occurrences of this specific variable string
        newText = newText.split(m.full).join(userInput);
    }

    return newText;
}

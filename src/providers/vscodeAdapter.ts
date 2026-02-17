import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';
import * as path from 'path';
import * as fs from 'fs';
import { pipelineEventBus } from '../eventBus';

export function registerVSCodeProvider(context: vscode.ExtensionContext) {
    // Register internal commands
    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.installExtensions', async (payload: any) => {
        await installExtensions(payload);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.vscodeRunCommand', async (payload: any) => {
        await runVSCodeCommand(payload);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.installVsix', async (payload: any) => {
        await installVsix(payload);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('intentRouter.internal.reviewDiff', async (payload: any) => {
        return await reviewDiff(payload);
    }));

    registerCapabilities({
        provider: 'vscode',
        type: 'vscode',
        capabilities: [
            {
                capability: 'vscode.installExtensions',
                command: 'intentRouter.internal.installExtensions',
                description: 'Install a list of VS Code extensions',
                determinism: 'deterministic',
                args: [{ name: 'extensions', type: 'string', description: 'Extension IDs', required: true }]
            },
            {
                capability: 'vscode.runCommand',
                command: 'intentRouter.internal.vscodeRunCommand',
                description: 'Run a VS Code command',
                determinism: 'interactive',
                args: [
                    { name: 'commandId', type: 'string', description: 'Command ID', required: true },
                    { name: 'argsJson', type: 'string', description: 'JSON args', default: '' }
                ]
            },
            {
                capability: 'vscode.reviewDiff',
                command: 'intentRouter.internal.reviewDiff',
                description: 'Review a file change using VS Code Diff view before applying',
                determinism: 'interactive',
                args: [
                    { name: 'path', type: 'path', description: 'File to modify', required: true },
                    { name: 'proposal', type: 'string', description: 'New content proposed', required: true }
                ]
            }
        ]
    });
}

export async function reviewDiff(payload: any): Promise<boolean> {
    const filePath = payload?.path;
    const proposal = payload?.proposal;
    const meta = payload?.__meta;
    const nodeId = meta?.stepId;
    const runId = meta?.runId;
    const intentId = meta?.traceId || 'unknown';

    const log = (text: string, stream: 'stdout' | 'stderr' = 'stdout') => {
        if (runId) {
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                stepId: nodeId,
                text: text + '\n',
                stream
            });
        }
    };

    if (!filePath || proposal === undefined) {
        log('[Approval] Error: Missing path or proposal content.', 'stderr');
        return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const absolutePath = path.isAbsolute(filePath) ? filePath : (workspaceRoot ? path.join(workspaceRoot, filePath) : filePath);

    // Use a safer temp location
    const tempDir = workspaceRoot || process.env.TEMP || process.env.TMP || '/tmp';
    const tempFileName = `proposal_${Date.now()}.tmp`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    try {
        log(`[Approval] Target: ${filePath}`);
        
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        // Write the proposal to the temp file
        fs.writeFileSync(tempFilePath, proposal, { encoding: 'utf8', flag: 'w' });

        // IMPORTANT: Verify file was written
        if (!fs.existsSync(tempFilePath)) {
            throw new Error(`Failed to create temp file at ${tempFilePath}`);
        }

        const originalUri = vscode.Uri.file(absolutePath);
        const tempUri = vscode.Uri.file(tempFilePath);
        
        // Handle nonexistent original file
        let originalToUse = originalUri;
        if (!fs.existsSync(absolutePath)) {
            log(`[Approval] New file detected: ${filePath}`);
            // Create empty file to avoid diff error
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(absolutePath, '');
        }

        // Open Diff
        await vscode.commands.executeCommand('vscode.diff', originalToUse, tempUri, `Review: ${path.basename(filePath)}`);

        log('[Approval] Waiting for your decision in the graph...');

        const decision = await new Promise<'approve' | 'reject'>((resolve) => {
            const timeout = setTimeout(() => {
                log('[Approval] Timeout (5m). Auto-rejecting.', 'stderr');
                resolve('reject');
            }, 300000); 
            
            const disposable = pipelineEventBus.on((msg: any) => {
                if (msg.type === 'pipelineDecision' && msg.nodeId === nodeId) {
                    clearTimeout(timeout);
                    disposable.dispose();
                    resolve(msg.decision);
                }
            });
        });

        if (decision === 'approve') {
            log(`[Approval] APPROVED. Updating ${filePath}...`);
            fs.writeFileSync(absolutePath, proposal, { encoding: 'utf8' });
            vscode.window.showInformationMessage(`Successfully updated ${path.basename(filePath)}`);
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return true;
        } else {
            log(`[Approval] REJECTED. No changes made.`);
            vscode.window.showWarningMessage(`Change rejected for ${path.basename(filePath)}`);
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return false;
        }

    } catch (error: any) {
        log(`[Approval] Error: ${error.message}`, 'stderr');
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return false;
    }
}

export async function installExtensions(payload: any): Promise<void> {
    const rawExtensions = payload?.extensions;
    if (!rawExtensions) return;
    let extensions = Array.isArray(rawExtensions) ? rawExtensions : rawExtensions.split('\n').map((s:any) => s.trim()).filter(Boolean);
    for (const id of extensions) {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
    }
}

export async function runVSCodeCommand(payload: any): Promise<void> {
    const commandId = payload?.commandId;
    if (!commandId) return;
    const args = payload?.argsJson ? JSON.parse(payload.argsJson) : undefined;
    if (Array.isArray(args)) {
        await vscode.commands.executeCommand(commandId, ...args);
    } else {
        await vscode.commands.executeCommand(commandId, args);
    }
}

export async function installVsix(payload: any): Promise<void> {
    const vsixPath = payload?.vsixPath;
    if (!vsixPath) return;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    const resolved = path.isAbsolute(vsixPath) ? vsixPath : (workspaceRoot ? path.join(workspaceRoot, vsixPath) : vsixPath);
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(resolved));
}

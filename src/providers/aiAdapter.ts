import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';

export function registerAiProvider(context: vscode.ExtensionContext) {
    registerCapabilities({
        provider: 'ai',
        type: 'vscode',
        capabilities: [
            {
                capability: 'ai.generate',
                command: 'intentRouter.internal.aiGenerate',
                description: 'Generate code or content using an AI agent',
                determinism: 'interactive',
                args: [
                    { name: 'instruction', type: 'string', description: 'The prompt/instruction for the agent', required: true },
                    { name: 'contextFiles', type: 'string', description: 'Glob patterns for context files', default: [] },
                    { name: 'agent', type: 'enum', options: ['gemini', 'claude', 'custom'], description: 'The AI agent to use', default: 'gemini' },
                    { name: 'model', type: 'string', description: 'Model name override' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store result' }
                ]
            }
        ]
    });
}

export async function executeAiCommand(args: any): Promise<any> {
    const instruction = args?.instruction;
    const contextFiles = args?.contextFiles || [];
    const agent = args?.agent || 'gemini';
    const meta = args?.__meta;

    if (!instruction) {
        throw new Error('AI Generate: Instruction is required');
    }

    const runId = meta?.runId;
    const stepId = meta?.stepId;
    const intentId = meta?.traceId || 'unknown';

    const log = (text: string, stream: 'stdout' | 'stderr' = 'stdout') => {
        if (runId) {
            pipelineEventBus.emit({
                type: 'stepLog',
                runId,
                intentId,
                stepId,
                text: text,
                stream
            });
        } else {
            console.log(`[AI Adapter] ${text}`);
        }
    };

    log(`Starting AI Agent: ${agent}\n`);

    // 1. Resolve Context Files
    let contextContent = '';
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.';

    if (Array.isArray(contextFiles) && contextFiles.length > 0) {
        log(`Resolving context files...\n`);
        for (const pattern of contextFiles) {
            if (!pattern || typeof pattern !== 'string') continue;
            try {
                const files = await glob(pattern, { cwd: workspaceRoot, nodir: true, absolute: true });
                if (Array.isArray(files)) {
                    for (const fullPath of files) {
                        const relativePath = path.relative(workspaceRoot, fullPath);
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            contextContent += `\n--- FILE: ${relativePath} ---\n${content}\n`;
                            log(`  + Added context: ${relativePath}\n`);
                        } catch (readErr: any) {
                            log(`  ! Failed to read ${relativePath}: ${readErr.message}\n`, 'stderr');
                        }
                    }
                }
            } catch (globErr: any) {
                log(`  ! Glob error for "${pattern}": ${globErr.message}\n`, 'stderr');
            }
        }
    }

    // 2. Construct Full Prompt
    const fullPrompt = `
IMPORTANT: You are working in a large codebase. 
DO NOT read or index "node_modules", "out", "dist", ".git", or ".vscode-test" unless explicitly asked.
Focus only on the provided context and the current directory structure.

CONTEXT:
${contextContent}

INSTRUCTION:
${instruction}

SUMMARY & EXIT:
Perform the task using your tools. Once finished, provide a brief summary and EXIT. 
Do not ask for confirmation or further instructions.
    `.trim();

    const modelName = args.model || 'gemini-2.5-flash';
    log(`\nExecuting Gemini CLI [Model: ${modelName}]...\n`);
    
    return new Promise((resolve, reject) => {
        const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
        const env = { ...process.env, ...envOverrides };
        
        const geminiExecutable = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
        const geminiArgs = ['-m', modelName, '-y', '-p', '-'];

        const child = cp.spawn(geminiExecutable, geminiArgs, { 
            cwd: workspaceRoot, 
            env,
            shell: process.platform === 'win32'
        });

        let fullResponse = '';

        if (child.stdin) {
            child.stdin.write(fullPrompt);
            child.stdin.end();
        }
        
        child.stdout.on('data', (d) => {
            const text = d.toString();
            fullResponse += text;
            log(text);
        });

        child.stderr.on('data', (d) => {
            const text = d.toString();
            if (!text.includes('AttachConsole failed') && !text.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
                log(text, 'stderr');
            }
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                log(`\n[AI Agent] Task completed successfully.\n`);
                resolve(fullResponse.trim());
            } else {
                log(`\n[AI Agent] Failed with exit code ${code}\n`, 'stderr');
                reject(new Error(`Agent exited with code ${code}`));
            }
        });

        child.on('error', (err) => {
            log(`\n[AI Agent] Process error: ${err.message}\n`, 'stderr');
            reject(err);
        });
    });
}

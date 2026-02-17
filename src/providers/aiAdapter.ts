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
                    { name: 'outputVar', type: 'string', description: 'Variable to store result content' },
                    { name: 'outputVarPath', type: 'string', description: 'Variable to store result path' }
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
        }
    };

    log(`Starting AI Agent: ${agent}\n`);

    let contextContent = '';
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.';

    if (Array.isArray(contextFiles) && contextFiles.length > 0) {
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
                        } catch (readErr: any) {
                            log(`! Error reading ${relativePath}: ${readErr.message}\n`, 'stderr');
                        }
                    }
                }
            } catch (globErr: any) {
                log(`! Glob error: ${globErr.message}\n`, 'stderr');
            }
        }
    }

    const fullPrompt = `
IMPORTANT: You are an AI Architect. 
Your role is to PROPOSE changes.

RULES:
1. Provide the target file path inside [PATH]...[/PATH].
2. Provide your proposed file content inside [RESULT]\`\`\`...\`\`\`[/RESULT] blocks.
3. NEVER execute tools yourself.
4. Output EXACTLY ONE [PATH] and ONE [RESULT] block per response.

CONTEXT:
${contextContent}

INSTRUCTION:
${instruction}
    `.trim();

    const modelName = args.model || 'gemini-2.0-flash-exp';
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

        let fullOutput = '';

        if (child.stdin) {
            child.stdin.write(fullPrompt);
            child.stdin.end();
        }
        
        child.stdout.on('data', (d) => {
            const text = d.toString();
            fullOutput += text;
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
                log(`\n[AI Agent] Analysis complete.\n`);

                // PATH extraction (case insensitive, handle whitespace)
                const pathMatches = [...fullOutput.matchAll(/\[PATH\]\s*([\s\S]*?)\s*\[\/PATH\]/gi)];
                const filePath = pathMatches.length > 0 ? pathMatches[pathMatches.length - 1][1].trim() : '';

                // CONTENT extraction
                const resultMatches = [...fullOutput.matchAll(/\[RESULT\]\s*```(?:\w+)?\s*([\s\S]*?)```\s*\[\/RESULT\]/gi)];
                let content = '';
                
                if (resultMatches.length > 0) {
                    content = resultMatches[resultMatches.length - 1][1].trim();
                } else {
                    const codeBlockMatches = [...fullOutput.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/gi)];
                    if (codeBlockMatches.length > 0) {
                        content = codeBlockMatches[codeBlockMatches.length - 1][1].trim();
                    } else {
                        content = fullOutput.trim();
                    }
                }

                resolve({
                    content: content,
                    path: filePath
                });
            } else {
                reject(new Error(`Agent exited with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

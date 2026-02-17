import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';

type ProposedChange = {
    path: string;
    content: string;
};

type AiCliSpec = {
    executable: string;
    args: string[];
    useStdinPrompt: boolean;
};

type TeamStrategy = 'sequential' | 'reviewer_gate' | 'vote';
type TeamMember = {
    name?: string;
    agent?: string;
    model?: string;
    instruction?: string;
    contextFiles?: string[];
    agentSpecFiles?: string[];
    outputVar?: string;
    outputVarPath?: string;
    outputVarChanges?: string;
};

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
                    { name: 'agent', type: 'enum', options: ['gemini', 'codex'], description: 'The AI agent provider', default: 'gemini' },
                    { name: 'model', type: 'string', description: 'Model name override' },
                    { name: 'outputContract', type: 'enum', options: ['path_result'], description: 'Expected AI output contract', default: 'path_result' },
                    { name: 'agentSpecFiles', type: 'string', description: 'Glob patterns for AGENTS.md / SKILL.md', default: [] },
                    { name: 'outputVar', type: 'string', description: 'Variable to store result content' },
                    { name: 'outputVarPath', type: 'string', description: 'Variable to store result path' },
                    { name: 'outputVarChanges', type: 'string', description: 'Variable to store structured changes list' }
                ]
            },
            {
                capability: 'ai.team',
                command: 'intentRouter.internal.aiTeam',
                description: 'Execute a team of AI agents in sequence',
                determinism: 'interactive',
                args: [
                    { name: 'strategy', type: 'enum', options: ['sequential', 'reviewer_gate', 'vote'], description: 'Team strategy', default: 'sequential' },
                    { name: 'members', type: 'string', description: 'Team members configuration', required: true },
                    { name: 'contextFiles', type: 'string', description: 'Shared context glob patterns', default: [] },
                    { name: 'agentSpecFiles', type: 'string', description: 'Shared spec files glob patterns', default: [] },
                    { name: 'outputContract', type: 'enum', options: ['path_result'], description: 'Expected AI output contract', default: 'path_result' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store final result content' },
                    { name: 'outputVarPath', type: 'string', description: 'Variable to store final result path' },
                    { name: 'outputVarChanges', type: 'string', description: 'Variable to store final structured changes list' }
                ]
            }
        ]
    });
}

export async function executeAiCommand(args: any): Promise<any> {
    const instruction = args?.instruction;
    const contextFiles = args?.contextFiles || [];
    const agentSpecFiles = args?.agentSpecFiles || [];
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

    contextContent += await loadContextFilesBlock(contextFiles, workspaceRoot, log, 'FILE');
    contextContent += await loadContextFilesBlock(agentSpecFiles, workspaceRoot, log, 'SPEC');

    const fullPrompt = `
IMPORTANT: You are an AI Architect. 
Your role is to PROPOSE changes.

RULES:
1. Use ONLY this format, repeated once per file:
   [PATH]relative/or/absolute/file/path[/PATH]
   [RESULT]\`\`\`language
   file content here
   \`\`\`[/RESULT]
2. You may output multiple PATH/RESULT pairs for multi-file changes.
3. NEVER execute tools yourself.
4. Do not output any extra text outside [PATH]/[RESULT] blocks.
5. Return only the final answer blocks. No intro, no explanation.

CONTEXT:
${contextContent}

INSTRUCTION:
${instruction}
    `.trim();

    const modelName = args.model || 'gemini-2.0-flash-exp';
    const cliSpec = resolveAiCliSpec(agent, modelName, fullPrompt);
    log(`\nExecuting ${agent} CLI [Model: ${modelName}]...\n`);
    
    return new Promise((resolve, reject) => {
        const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
        const env = { ...process.env, ...envOverrides };

        const child = cp.spawn(cliSpec.executable, cliSpec.args, {
            cwd: workspaceRoot, 
            env,
            shell: process.platform === 'win32'
        });

        let fullOutput = '';

        if (cliSpec.useStdinPrompt && child.stdin) {
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
                let changes: ProposedChange[] = [];
                try {
                    changes = parseProposedChangesStrict(fullOutput);
                    if (changes.length === 0) {
                        return reject(new Error('Invalid AI output: expected [PATH]...[\\/PATH] + [RESULT]...[\\/RESULT] blocks.'));
                    }
                } catch (error: any) {
                    return reject(new Error(String(error?.message || error)));
                }

                if (changes.length === 1) {
                    resolve({
                        content: changes[0].content,
                        path: changes[0].path,
                        changes
                    });
                    return;
                }

                resolve({
                    content: JSON.stringify({ changes }, null, 2),
                    path: changes[0].path,
                    changes
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

export async function executeAiTeamCommand(args: any): Promise<any> {
    const strategy = normalizeTeamStrategy(args?.strategy);
    const members = normalizeTeamMembers(args?.members);
    if (members.length === 0) {
        throw new Error('AI Team: members is required and must contain at least one member.');
    }

    if (strategy !== 'sequential') {
        throw new Error(`AI Team: strategy "${strategy}" is not yet implemented in this version.`);
    }

    const sharedContextFiles = asStringArray(args?.contextFiles);
    const sharedSpecFiles = asStringArray(args?.agentSpecFiles);
    const teamVarStore = new Map<string, string>();
    let finalResult: any = null;

    for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        const memberName = String(member.name || `member_${index + 1}`);
        const instructionRaw = String(member.instruction || '').trim();
        if (!instructionRaw) {
            throw new Error(`AI Team: member "${memberName}" has empty instruction.`);
        }

        const instructionResolved = applyTeamVariables(instructionRaw, teamVarStore);
        const memberArgs = {
            ...args,
            agent: member.agent || args?.agent || 'gemini',
            model: member.model || args?.model,
            instruction: instructionResolved,
            contextFiles: mergeStringArrays(sharedContextFiles, asStringArray(member.contextFiles)),
            agentSpecFiles: mergeStringArrays(sharedSpecFiles, asStringArray(member.agentSpecFiles)),
            outputVar: member.outputVar || args?.outputVar,
            outputVarPath: member.outputVarPath || args?.outputVarPath,
            outputVarChanges: member.outputVarChanges || args?.outputVarChanges
        };

        const result = await executeAiCommand(memberArgs);
        finalResult = result;

        if (result && typeof result === 'object') {
            if (result.content !== undefined) {
                teamVarStore.set(`${memberName}.content`, String(result.content));
            }
            if (result.path !== undefined) {
                teamVarStore.set(`${memberName}.path`, String(result.path));
            }
            if (result.changes !== undefined) {
                teamVarStore.set(`${memberName}.changes`, JSON.stringify(result.changes));
            }
        }
    }

    return finalResult;
}

function mergeStringArrays(a: string[], b: string[]): string[] {
    const merged = [...a, ...b].map((value) => String(value || '').trim()).filter(Boolean);
    return Array.from(new Set(merged));
}

function asStringArray(value: any): string[] {
    return Array.isArray(value)
        ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
}

function applyTeamVariables(input: string, vars: Map<string, string>): string {
    return String(input || '').replace(/\$\{team:([^}]+)\}/g, (match, key) => {
        const normalized = String(key || '').trim();
        return vars.has(normalized) ? vars.get(normalized)! : match;
    });
}

export function normalizeTeamStrategy(value: any): TeamStrategy {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'reviewer_gate') return 'reviewer_gate';
    if (raw === 'vote') return 'vote';
    return 'sequential';
}

export function normalizeTeamMembers(input: any): TeamMember[] {
    if (!Array.isArray(input)) {
        return [];
    }
    const members: TeamMember[] = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') continue;
        members.push({
            name: String(entry.name || '').trim(),
            agent: String(entry.agent || '').trim() || undefined,
            model: String(entry.model || '').trim() || undefined,
            instruction: String(entry.instruction || '').trim(),
            contextFiles: asStringArray(entry.contextFiles),
            agentSpecFiles: asStringArray(entry.agentSpecFiles),
            outputVar: String(entry.outputVar || '').trim() || undefined,
            outputVarPath: String(entry.outputVarPath || '').trim() || undefined,
            outputVarChanges: String(entry.outputVarChanges || '').trim() || undefined
        });
    }
    return members.filter((member) => !!String(member.instruction || '').trim());
}

async function loadContextFilesBlock(
    patterns: any,
    workspaceRoot: string,
    log: (text: string, stream?: 'stdout' | 'stderr') => void,
    label: 'FILE' | 'SPEC'
): Promise<string> {
    let aggregated = '';
    if (!Array.isArray(patterns) || patterns.length === 0) {
        return aggregated;
    }

    for (const pattern of patterns) {
        if (!pattern || typeof pattern !== 'string') continue;
        try {
            const files = await glob(pattern, { cwd: workspaceRoot, nodir: true, absolute: true });
            if (!Array.isArray(files)) continue;
            for (const fullPath of files) {
                const relativePath = path.relative(workspaceRoot, fullPath);
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    aggregated += `\n--- ${label}: ${relativePath} ---\n${content}\n`;
                } catch (readErr: any) {
                    log(`! Error reading ${relativePath}: ${readErr.message}\n`, 'stderr');
                }
            }
        } catch (globErr: any) {
            log(`! Glob error: ${globErr.message}\n`, 'stderr');
        }
    }
    return aggregated;
}

function normalizeAgentProvider(agent: string): 'gemini' | 'codex' {
    const normalized = String(agent || '').trim().toLowerCase();
    if (normalized === 'codex' || normalized === 'codex-cli') return 'codex';
    return 'gemini';
}

export function resolveAiCliSpec(agent: string, model: string, prompt: string): AiCliSpec {
    const provider = normalizeAgentProvider(agent);
    if (provider === 'gemini') {
        return {
            executable: process.platform === 'win32' ? 'gemini.cmd' : 'gemini',
            args: ['-m', model, '-y', '-p', '-'],
            useStdinPrompt: true
        };
    }

    const cfg = vscode.workspace.getConfiguration('intentRouter');
    const command = cfg.get<string>('ai.codex.command', process.platform === 'win32' ? 'codex.cmd' : 'codex');
    const rawArgs = cfg.get<string[]>('ai.codex.args', ['exec', '--model', '{model}', '{stdin}']);
    if (!Array.isArray(rawArgs) || rawArgs.length === 0) {
        throw new Error('Codex CLI args are empty. Configure intentRouter.ai.codex.args.');
    }
    let useStdinPrompt = false;
    const args = rawArgs
        .map((token) => String(token ?? ''))
        .map((token) => token.split('{model}').join(model))
        .map((token) => {
            if (token.includes('{prompt}')) {
                return token.split('{prompt}').join(prompt);
            }
            if (token.includes('{stdin}')) {
                useStdinPrompt = true;
                return token.split('{stdin}').join('');
            }
            return token;
        })
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    return {
        executable: command,
        args,
        useStdinPrompt
    };
}

function stripAnsi(input: string): string {
    return String(input || '').replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseProposedChangesStrict(output: string): ProposedChange[] {
    const normalized = stripAnsi(output);
    const blockPattern = /\[PATH\]\s*([\s\S]*?)\s*\[\/PATH\]\s*\[RESULT\]\s*(?:```[\w-]*\s*)?([\s\S]*?)(?:```)?\s*\[\/RESULT\]/gi;
    const changes: ProposedChange[] = [];
    let cursor = 0;
    let matchedAtLeastOne = false;
    let match: RegExpExecArray | null = null;

    while ((match = blockPattern.exec(normalized)) !== null) {
        matchedAtLeastOne = true;
        const chunkBetween = normalized.slice(cursor, match.index);
        if (chunkBetween.trim().length > 0) {
            throw new Error('Invalid AI output: text found outside [PATH]/[RESULT] blocks.');
        }
        cursor = match.index + match[0].length;

        const targetPath = String(match[1] || '').trim();
        const content = String(match[2] || '').trim();
        if (!targetPath || !content) {
            throw new Error('Invalid AI output: empty PATH or RESULT block.');
        }
        changes.push({ path: targetPath, content });
    }

    if (!matchedAtLeastOne) {
        return [];
    }

    const trailing = normalized.slice(cursor);
    if (trailing.trim().length > 0) {
        throw new Error('Invalid AI output: trailing text found outside [PATH]/[RESULT] blocks.');
    }

    return changes;
}

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { pipelineEventBus } from '../eventBus';
import { registerCapabilities } from '../registry';
import { appendSessionMemory, clearSessionMemory, isSessionMemoryEnabled, loadSessionMemory, SessionMemoryEntry } from '../sessionMemoryStore';

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
type AgentRole = 'brainstorm' | 'prd' | 'architect' | 'backend' | 'frontend' | 'reviewer' | 'qa' | 'custom';
type OutputContract = 'path_result' | 'unified_diff';
type TeamMember = {
    name?: string;
    role?: 'writer' | 'reviewer';
    agent?: string;
    model?: string;
    cwd?: string;
    systemPrompt?: string;
    instruction?: string;
    contextFiles?: string[];
    agentSpecFiles?: string[];
    outputVar?: string;
    outputVarPath?: string;
    outputVarChanges?: string;
};

type SessionMemoryMode = 'runtime_only' | 'read_only' | 'write_only' | 'read_write';

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
                    { name: 'cwd', type: 'path', description: 'Working directory for CLI execution (inside workspace)' },
                    { name: 'systemPrompt', type: 'string', description: 'Optional system-level constraints applied before instruction' },
                    { name: 'contextFiles', type: 'string', description: 'Glob patterns for context files', default: [] },
                    { name: 'agent', type: 'enum', options: ['gemini', 'codex'], description: 'The AI agent provider', default: 'gemini' },
                    { name: 'model', type: 'string', description: 'Model name override' },
                    { name: 'role', type: 'enum', options: ['brainstorm', 'prd', 'architect', 'backend', 'frontend', 'reviewer', 'qa'], description: 'Agent role profile', default: 'architect' },
                    { name: 'instructionTemplate', type: 'string', description: 'Optional instruction template (supports ${instruction})' },
                    { name: 'outputContract', type: 'enum', options: ['path_result', 'unified_diff'], description: 'Expected AI output contract', default: 'path_result' },
                    { name: 'agentSpecFiles', type: 'string', description: 'Glob patterns for AGENTS.md / SKILL.md', default: [] },
                    { name: 'outputVar', type: 'string', description: 'Variable to store result content' },
                    { name: 'outputVarPath', type: 'string', description: 'Variable to store result path' },
                    { name: 'outputVarChanges', type: 'string', description: 'Variable to store structured changes list' },
                    { name: 'reasoningEffort', type: 'enum', options: ['low', 'medium', 'high', 'extra_high'], description: 'Reasoning depth (codex provider)', default: 'medium' },
                    { name: 'sessionId', type: 'string', description: 'Optional persistent memory session id' },
                    { name: 'sessionMode', type: 'enum', options: ['runtime_only', 'read_only', 'write_only', 'read_write'], description: 'Session memory mode', default: 'read_write' },
                    { name: 'sessionResetBeforeRun', type: 'boolean', description: 'Reset session memory before running agent', default: false },
                    { name: 'sessionRecallLimit', type: 'string', description: 'Max session memory entries injected into prompt', default: '12' }
                ]
            },
            {
                capability: 'ai.team',
                command: 'intentRouter.internal.aiTeam',
                description: 'Execute a team of AI agents in sequence',
                determinism: 'interactive',
                args: [
                    { name: 'strategy', type: 'enum', options: ['sequential', 'reviewer_gate', 'vote'], description: 'Team strategy', default: 'sequential' },
                    { name: 'cwd', type: 'path', description: 'Shared working directory for team members (inside workspace)' },
                    { name: 'systemPrompt', type: 'string', description: 'Optional shared system-level constraints for team members' },
                    { name: 'members', type: 'string', description: 'Team members configuration', required: true },
                    { name: 'contextFiles', type: 'string', description: 'Shared context glob patterns', default: [] },
                    { name: 'agentSpecFiles', type: 'string', description: 'Shared spec files glob patterns', default: [] },
                    { name: 'outputContract', type: 'enum', options: ['path_result', 'unified_diff'], description: 'Expected AI output contract', default: 'path_result' },
                    { name: 'outputVar', type: 'string', description: 'Variable to store final result content' },
                    { name: 'outputVarPath', type: 'string', description: 'Variable to store final result path' },
                    { name: 'outputVarChanges', type: 'string', description: 'Variable to store final structured changes list' },
                    { name: 'sessionId', type: 'string', description: 'Optional persistent memory session id' },
                    { name: 'sessionMode', type: 'enum', options: ['runtime_only', 'read_only', 'write_only', 'read_write'], description: 'Session memory mode', default: 'read_write' },
                    { name: 'sessionResetBeforeRun', type: 'boolean', description: 'Reset session memory before running team', default: false },
                    { name: 'sessionRecallLimit', type: 'string', description: 'Max session memory entries injected into prompt', default: '12' },
                    { name: 'reviewerVoteWeight', type: 'string', description: 'Reviewer weight multiplier when strategy=vote', default: '2' }
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
    const sessionEnabled = isSessionMemoryEnabled();
    const sessionId = String(args?.sessionId || '').trim();
    const sessionPolicy = resolveSessionMemoryPolicy(args?.sessionMode);
    if (sessionEnabled && sessionId && args?.sessionResetBeforeRun === true) {
        clearSessionMemory(sessionId);
    }
    const recallLimitRaw = Number(args?.sessionRecallLimit);
    const recallLimit = Number.isFinite(recallLimitRaw) ? Math.max(1, Math.floor(recallLimitRaw)) : 12;
    const persistedSession = sessionEnabled && sessionId && sessionPolicy.read
        ? loadSessionMemory(sessionId).slice(-recallLimit)
        : [];
    const role = normalizeAgentRole(args?.role);
    const systemPrompt = String(args?.systemPrompt || '').trim();
    const instructionResolved = applyInstructionTemplate(args?.instructionTemplate, instruction);
    const outputContract = normalizeOutputContract(args?.outputContract);
    const contractRules = outputContract === 'unified_diff'
        ? [
            '1. Use ONLY this format:',
            '   [DIFF]```diff',
            '   unified diff content',
            '   ```[/DIFF]',
            '2. Do not output any text outside [DIFF] block.'
        ]
        : [
            '1. Use ONLY this format, repeated once per file:',
            '   [PATH]relative/or/absolute/file/path[/PATH]',
            '   [RESULT]```language',
            '   file content here',
            '   ```[/RESULT]',
            '2. You may output multiple PATH/RESULT pairs for multi-file changes.',
            '3. Do not output any extra text outside [PATH]/[RESULT] blocks.'
        ];

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
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const effectiveCwd = resolveAiWorkingDirectory(args?.cwd, meta?.cwd, workspaceRoot, log);

    contextContent += await loadContextFilesBlock(contextFiles, workspaceRoot, log, 'FILE');
    contextContent += await loadContextFilesBlock(agentSpecFiles, workspaceRoot, log, 'SPEC');

    const fullPrompt = `
IMPORTANT: You are an AI Architect. 
Your role is to PROPOSE changes.
${buildAgentRoleBlock(role)}
${systemPrompt ? `\nSYSTEM_PROMPT:\n${systemPrompt}\n` : ''}

RULES:
${contractRules.join('\n')}
4. NEVER execute tools yourself.
5. Return only the final answer blocks. No intro, no explanation.

CONTEXT:
${contextContent}

${buildPersistedSessionBlock(persistedSession)}

INSTRUCTION:
${instructionResolved}
    `.trim();

    const modelName = args.model || 'gemini-2.0-flash-exp';
    const cliSpec = resolveAiCliSpec(agent, modelName, fullPrompt, String(args?.reasoningEffort || 'medium'));
    log(`\nExecuting ${agent} CLI [Model: ${modelName}]...\n`);
    
    return new Promise((resolve, reject) => {
        const envOverrides = vscode.workspace.getConfiguration('intentRouter').get<Record<string, string>>('environment') || {};
        const env = { ...process.env, ...envOverrides };
        let settled = false;

        const launch = (spec: AiCliSpec, allowReasoningFallback: boolean) => {
            const child = cp.spawn(spec.executable, spec.args, {
                cwd: effectiveCwd,
                env,
                shell: process.platform === 'win32'
            });

            let fullOutput = '';
            let fullStderr = '';

            if (spec.useStdinPrompt && child.stdin) {
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
                fullStderr += text;
                if (!text.includes('AttachConsole failed') && !text.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
                    log(text, 'stderr');
                }
            });

            child.on('close', (code) => {
                if (settled) return;
                if (code === 0) {
                    log(`\n[AI Agent] Analysis complete.\n`);
                    let changes: ProposedChange[] = [];
                    let unifiedDiff: string | undefined;
                    try {
                    if (outputContract === 'unified_diff') {
                        const parsed = parseUnifiedDiffStrict(fullOutput);
                        unifiedDiff = parsed.diff;
                        changes = parsed.paths.map((entryPath) => ({ path: entryPath, content: '' }));
                        if (!changes.length) {
                            settled = true;
                            return reject(new Error('Invalid AI output: expected [DIFF] block with at least one target file.'));
                        }
                    } else {
                        try {
                            changes = parseProposedChangesStrict(fullOutput);
                        } catch (strictError: any) {
                            const strictMessage = String(strictError?.message || strictError || '');
                            const recovered = parseProposedChangesLenient(fullOutput);
                            if (
                                recovered.length > 0 &&
                                (
                                    strictMessage.includes('text found outside [PATH]/[RESULT] blocks')
                                    || strictMessage.includes('trailing text found outside [PATH]/[RESULT] blocks')
                                )
                            ) {
                                log('\n[AI Agent] Non-block output detected; recovered valid [PATH]/[RESULT] blocks and continued.\n', 'stderr');
                                changes = recovered;
                            } else {
                                throw strictError;
                            }
                        }
                        if (changes.length === 0) {
                            settled = true;
                            return reject(new Error('Invalid AI output: expected [PATH]...[\\/PATH] + [RESULT]...[\\/RESULT] blocks.'));
                        }
                    }
                        if (sessionEnabled && sessionId && sessionPolicy.write) {
                            const entries: SessionMemoryEntry[] = changes.map((change) => ({
                                member: 'agent',
                                role: 'writer',
                                path: String(change.path || ''),
                                contentSnippet: outputContract === 'unified_diff'
                                    ? String(unifiedDiff || '').slice(0, 1200)
                                    : String(change.content || '').slice(0, 1200),
                                timestamp: Date.now()
                            }));
                            appendSessionMemory(sessionId, entries);
                        }
                    } catch (error: any) {
                        settled = true;
                        return reject(new Error(String(error?.message || error)));
                    }

                    settled = true;
                    if (outputContract === 'unified_diff') {
                        resolve({
                            content: String(unifiedDiff || ''),
                            path: changes[0].path,
                            changes,
                            unifiedDiff: String(unifiedDiff || '')
                        });
                        return;
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
                    return;
                }

                const canRetryWithoutReasoning = allowReasoningFallback
                    && normalizeAgentProvider(agent) === 'codex'
                    && hasReasoningEffortFlag(spec.args)
                    && isReasoningEffortUnsupportedError(`${fullOutput}\n${fullStderr}`);

                if (canRetryWithoutReasoning) {
                    const fallbackArgs = stripReasoningEffortFlag(spec.args);
                    log('\n[AI Agent] Codex CLI does not support --reasoning-effort on this version. Retrying without it.\n', 'stderr');
                    launch({ ...spec, args: fallbackArgs }, false);
                    return;
                }

                settled = true;
                const reason = String(fullStderr || '').trim();
                reject(new Error(reason ? `Agent exited with code ${code}: ${reason}` : `Agent exited with code ${code}`));
            });

            child.on('error', (err) => {
                if (settled) return;
                settled = true;
                reject(err);
            });
        };

        launch(cliSpec, true);
    });
}

export async function executeAiTeamCommand(args: any): Promise<any> {
    const strategy = normalizeTeamStrategy(args?.strategy);
    const members = normalizeTeamMembers(args?.members);
    const meta = args?.__meta;
    const runId = meta?.runId;
    const stepId = meta?.stepId;
    const intentId = meta?.traceId || 'unknown';
    const sessionEnabled = isSessionMemoryEnabled();
    const sessionId = String(args?.sessionId || '').trim();
    const sessionPolicy = resolveSessionMemoryPolicy(args?.sessionMode);
    if (sessionEnabled && sessionId && args?.sessionResetBeforeRun === true) {
        clearSessionMemory(sessionId);
    }
    const recallLimitRaw = Number(args?.sessionRecallLimit);
    const recallLimit = Number.isFinite(recallLimitRaw) ? Math.max(1, Math.floor(recallLimitRaw)) : 12;
    const persistedSession = sessionEnabled && sessionId && sessionPolicy.read
        ? loadSessionMemory(sessionId).slice(-recallLimit)
        : [];
    if (members.length === 0) {
        throw new Error('AI Team: members is required and must contain at least one member.');
    }

    const sharedContextFiles = asStringArray(args?.contextFiles);
    const sharedSpecFiles = asStringArray(args?.agentSpecFiles);
    const teamVarStore = new Map<string, string>();
    const runResults: Array<{ member: TeamMember; result: any }> = [];
    const reviewerVoteWeight = resolveReviewerVoteWeight(args?.reviewerVoteWeight);

    for (let index = 0; index < members.length; index += 1) {
        const member = members[index];
        const memberName = String(member.name || `member_${index + 1}`);
        const instructionRaw = String(member.instruction || '').trim();
        if (!instructionRaw) {
            throw new Error(`AI Team: member "${memberName}" has empty instruction.`);
        }

        const instructionResolved = applyTeamVariables(
            `${instructionRaw}\n\n${buildTeamMemoryBlock(teamVarStore)}\n\n${buildPersistedSessionBlock(persistedSession)}`,
            teamVarStore
        );
        const memberArgs = {
            ...args,
            agent: member.agent || args?.agent || 'gemini',
            model: member.model || args?.model,
            cwd: member.cwd || args?.cwd,
            systemPrompt: member.systemPrompt || args?.systemPrompt,
            instruction: instructionResolved,
            contextFiles: mergeStringArrays(sharedContextFiles, asStringArray(member.contextFiles)),
            agentSpecFiles: mergeStringArrays(sharedSpecFiles, asStringArray(member.agentSpecFiles)),
            outputVar: member.outputVar || args?.outputVar,
            outputVarPath: member.outputVarPath || args?.outputVarPath,
            outputVarChanges: member.outputVarChanges || args?.outputVarChanges
        };

        const result = await executeAiCommand(memberArgs);
        runResults.push({ member, result });

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
            teamVarStore.set(`${memberName}.result`, JSON.stringify(result));
        }
    }

    const decision = computeTeamDecision(strategy, runResults, reviewerVoteWeight);
    const finalResult = decision.result;
    if (sessionEnabled && sessionId && sessionPolicy.write) {
        const entries: SessionMemoryEntry[] = runResults.map(({ member, result }, index) => {
            const memberName = String(member.name || `member_${index + 1}`);
            const role = member.role === 'reviewer' ? 'reviewer' : 'writer';
            const content = String(result?.content || '');
            return {
                member: memberName,
                role,
                path: String(result?.path || ''),
                contentSnippet: content.slice(0, 1200),
                timestamp: Date.now()
            };
        });
        appendSessionMemory(sessionId, entries);
    }
    if (runId) {
        pipelineEventBus.emit({
            type: 'teamRunSummary',
            runId,
            intentId,
            stepId,
            strategy,
            winnerMember: decision.winnerMember,
            winnerReason: decision.winnerReason,
            voteScoreByMember: decision.voteScoreByMember,
            members: buildTeamSummaryMembers(runResults),
            totalFiles: sumTeamFiles(runResults)
        });
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

function buildTeamMemoryBlock(vars: Map<string, string>): string {
    if (!vars || vars.size === 0) {
        return 'TEAM_MEMORY: none';
    }
    const lines: string[] = [];
    for (const [key, value] of vars.entries()) {
        lines.push(`- ${key}: ${String(value).slice(0, 800)}`);
    }
    return ['TEAM_MEMORY:', ...lines].join('\n');
}

function buildPersistedSessionBlock(entries: SessionMemoryEntry[]): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'SESSION_MEMORY: none';
    }
    const lines = entries
        .map((entry) => `- ${entry.member} [${entry.role}] ${entry.path}: ${String(entry.contentSnippet || '').slice(0, 280)}`);
    return ['SESSION_MEMORY:', ...lines].join('\n');
}

export function resolveSessionMemoryPolicy(modeRaw: any): { mode: SessionMemoryMode; read: boolean; write: boolean } {
    const mode = String(modeRaw || 'read_write').trim().toLowerCase();
    if (mode === 'runtime_only') {
        return { mode: 'runtime_only', read: false, write: false };
    }
    if (mode === 'read_only') {
        return { mode: 'read_only', read: true, write: false };
    }
    if (mode === 'write_only') {
        return { mode: 'write_only', read: false, write: true };
    }
    return { mode: 'read_write', read: true, write: true };
}

export function normalizeAgentRole(value: any): AgentRole {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'brainstorm' || raw === 'prd' || raw === 'architect' || raw === 'backend' || raw === 'frontend' || raw === 'reviewer' || raw === 'qa') {
        return raw;
    }
    return 'custom';
}

export function applyInstructionTemplate(templateRaw: any, instructionRaw: any): string {
    const instruction = String(instructionRaw || '').trim();
    const template = String(templateRaw || '').trim();
    if (!template) {
        return instruction;
    }
    if (template.includes('${instruction}')) {
        return template.split('${instruction}').join(instruction);
    }
    return `${template}\n\n${instruction}`.trim();
}

function buildAgentRoleBlock(role: AgentRole): string {
    const profiles: Record<Exclude<AgentRole, 'custom'>, string> = {
        brainstorm: 'Generate broad options, alternatives, and exploration paths.',
        prd: 'Produce precise product requirements and acceptance criteria.',
        architect: 'Design robust technical architecture and tradeoffs.',
        backend: 'Focus on backend implementation, APIs, data, and reliability.',
        frontend: 'Focus on UI, UX, state, and frontend implementation details.',
        reviewer: 'Critically review quality, risks, and consistency before approval.',
        qa: 'Focus on testability, edge cases, and validation coverage.'
    };
    if (role === 'custom') {
        return 'ROLE_PROFILE: custom';
    }
    return `ROLE_PROFILE: ${role}\nROLE_OBJECTIVE: ${profiles[role]}`;
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
            role: normalizeTeamMemberRole(entry.role),
            agent: String(entry.agent || '').trim() || undefined,
            model: String(entry.model || '').trim() || undefined,
            cwd: String(entry.cwd || '').trim() || undefined,
            systemPrompt: String(entry.systemPrompt || '').trim() || undefined,
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

export function resolveTeamStrategyResult(
    strategy: TeamStrategy,
    runResults: Array<{ member: TeamMember; result: any }>
): any {
    return computeTeamDecision(strategy, runResults, resolveReviewerVoteWeight()).result;
}

type TeamDecision = {
    result: any;
    winnerMember?: string;
    winnerReason?: string;
    voteScoreByMember?: Array<{ member: string; role: 'writer' | 'reviewer'; weight: number; score: number }>;
};

function computeTeamDecision(
    strategy: TeamStrategy,
    runResults: Array<{ member: TeamMember; result: any }>,
    reviewerVoteWeight: number
): TeamDecision {
    if (!Array.isArray(runResults) || runResults.length === 0) {
        throw new Error('AI Team: no member result available.');
    }

    if (strategy === 'sequential') {
        const winner = runResults[runResults.length - 1];
        return {
            result: winner.result,
            winnerMember: String(winner.member?.name || ''),
            winnerReason: 'sequential: last member result'
        };
    }

    if (strategy === 'reviewer_gate') {
        const reviewer = runResults.find((entry) => entry.member.role === 'reviewer');
        if (!reviewer) {
            throw new Error('AI Team: reviewer_gate requires at least one member with role="reviewer".');
        }
        return {
            result: reviewer.result,
            winnerMember: String(reviewer.member?.name || ''),
            winnerReason: 'reviewer_gate: reviewer decision'
        };
    }

    const vote = pickTeamResultByWeightedVote(runResults, reviewerVoteWeight);
    if (!vote?.result) {
        throw new Error('AI Team: vote strategy failed to select a winner.');
    }
    return {
        result: vote.result,
        winnerMember: vote.winnerMember,
        winnerReason: vote.winnerReason,
        voteScoreByMember: vote.voteScoreByMember
    };
}

export function pickTeamResultByVote(results: any[]): any | null {
    if (!Array.isArray(results) || results.length === 0) {
        return null;
    }

    const buckets = new Map<string, { count: number; result: any }>();
    for (const result of results) {
        const key = serializeTeamResultKey(result);
        const existing = buckets.get(key);
        if (existing) {
            existing.count += 1;
            continue;
        }
        buckets.set(key, { count: 1, result });
    }

    let winner: { count: number; result: any } | null = null;
    for (const bucket of buckets.values()) {
        if (!winner || bucket.count > winner.count) {
            winner = bucket;
        }
    }
    return winner ? winner.result : results[0];
}

export function pickTeamResultByWeightedVote(
    runResults: Array<{ member: TeamMember; result: any }>,
    reviewerVoteWeight: number
): {
    result: any;
    winnerMember?: string;
    winnerReason: string;
    voteScoreByMember: Array<{ member: string; role: 'writer' | 'reviewer'; weight: number; score: number }>;
} | null {
    if (!Array.isArray(runResults) || runResults.length === 0) {
        return null;
    }

    const normalizedReviewerWeight = Number.isFinite(reviewerVoteWeight) ? Math.max(1, Math.floor(reviewerVoteWeight)) : 2;
    const scoreBySignature = new Map<string, { score: number; firstIndex: number; result: any }>();
    const voteScoreByMember: Array<{ member: string; role: 'writer' | 'reviewer'; weight: number; score: number }> = [];

    for (let index = 0; index < runResults.length; index += 1) {
        const entry = runResults[index];
        const signature = serializeTeamResultKey(entry.result);
        const role = entry.member.role === 'reviewer' ? 'reviewer' : 'writer';
        const weight = role === 'reviewer' ? normalizedReviewerWeight : 1;
        voteScoreByMember.push({
            member: String(entry.member.name || `member_${index + 1}`),
            role,
            weight,
            score: weight
        });

        const bucket = scoreBySignature.get(signature);
        if (bucket) {
            bucket.score += weight;
        } else {
            scoreBySignature.set(signature, {
                score: weight,
                firstIndex: index,
                result: entry.result
            });
        }
    }

    let winningSignature: string | null = null;
    let winningBucket: { score: number; firstIndex: number; result: any } | null = null;
    for (const [signature, bucket] of scoreBySignature.entries()) {
        if (!winningBucket) {
            winningSignature = signature;
            winningBucket = bucket;
            continue;
        }
        if (bucket.score > winningBucket.score) {
            winningSignature = signature;
            winningBucket = bucket;
            continue;
        }
        if (bucket.score === winningBucket.score && bucket.firstIndex < winningBucket.firstIndex) {
            winningSignature = signature;
            winningBucket = bucket;
        }
    }

    if (!winningBucket || !winningSignature) {
        return null;
    }

    const winningEntry = runResults[winningBucket.firstIndex];
    const winnerName = String(winningEntry?.member?.name || `member_${winningBucket.firstIndex + 1}`);
    return {
        result: winningBucket.result,
        winnerMember: winnerName,
        winnerReason: `vote: score=${winningBucket.score} (reviewer weight=${normalizedReviewerWeight})`,
        voteScoreByMember
    };
}

function serializeTeamResultKey(result: any): string {
    if (!result || typeof result !== 'object') {
        return String(result);
    }
    const path = String(result.path || '');
    const changes = Array.isArray(result.changes) ? result.changes : [];
    const normalized = changes.map((entry: any) => ({
        path: String(entry?.path || '').trim(),
        content: String(entry?.content || '').trim()
    }));
    return JSON.stringify({ path, changes: normalized });
}

function buildTeamSummaryMembers(runResults: Array<{ member: TeamMember; result: any }>): Array<{ name: string; role: 'writer' | 'reviewer'; path: string; files: number }> {
    return runResults.map(({ member, result }, index) => {
        const name = String(member.name || `member_${index + 1}`);
        const role = member.role === 'reviewer' ? 'reviewer' : 'writer';
        const pathValue = String(result?.path || '');
        const files = Array.isArray(result?.changes) ? result.changes.length : (pathValue ? 1 : 0);
        return { name, role, path: pathValue, files };
    });
}

function sumTeamFiles(runResults: Array<{ member: TeamMember; result: any }>): number {
    return buildTeamSummaryMembers(runResults).reduce((sum, item) => sum + item.files, 0);
}

function resolveTeamWinnerMember(
    strategy: TeamStrategy,
    runResults: Array<{ member: TeamMember; result: any }>,
    finalResult: any
): string | undefined {
    if (strategy === 'reviewer_gate') {
        const reviewer = runResults.find((entry) => entry.member.role === 'reviewer');
        return reviewer?.member?.name ? String(reviewer.member.name) : undefined;
    }
    const matched = runResults.find((entry) => serializeTeamResultKey(entry.result) === serializeTeamResultKey(finalResult));
    if (matched?.member?.name) {
        return String(matched.member.name);
    }
    return runResults.length > 0 ? String(runResults[runResults.length - 1].member?.name || '') || undefined : undefined;
}

function normalizeTeamMemberRole(value: any): 'writer' | 'reviewer' {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'reviewer') return 'reviewer';
    return 'writer';
}

export function resolveReviewerVoteWeight(explicit?: any): number {
    const explicitValue = Number(explicit);
    if (Number.isFinite(explicitValue)) {
        return Math.max(1, Math.floor(explicitValue));
    }
    const cfg = vscode.workspace.getConfiguration('intentRouter');
    const raw = cfg.get<number>('ai.team.reviewerVoteWeight', 2);
    return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 2;
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

function resolveAiWorkingDirectory(
    payloadCwd: any,
    metaCwd: any,
    workspaceRoot: string,
    log: (text: string, stream?: 'stdout' | 'stderr') => void
): string {
    const baseRoot = path.resolve(workspaceRoot || process.cwd());
    const rawCandidate = String(payloadCwd || metaCwd || '').trim();
    if (!rawCandidate) {
        return baseRoot;
    }
    const resolved = path.isAbsolute(rawCandidate)
        ? path.resolve(rawCandidate)
        : path.resolve(baseRoot, rawCandidate);
    const relative = path.relative(baseRoot, resolved);
    const escapesRoot = relative.startsWith('..') || path.isAbsolute(relative);
    if (escapesRoot) {
        log(`[AI Agent] cwd "${rawCandidate}" is outside workspace; fallback to workspace root.\n`, 'stderr');
        return baseRoot;
    }
    return resolved;
}

function hasReasoningEffortFlag(args: string[]): boolean {
    return (args || []).some((token) => {
        const value = String(token || '').trim();
        return value === '--reasoning-effort' || value.startsWith('--reasoning-effort=');
    });
}

function stripReasoningEffortFlag(args: string[]): string[] {
    const next: string[] = [];
    let skipNext = false;
    for (const token of args || []) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        const value = String(token || '').trim();
        if (value === '--reasoning-effort') {
            skipNext = true;
            continue;
        }
        if (value.startsWith('--reasoning-effort=')) {
            continue;
        }
        next.push(token);
    }
    return next;
}

function isReasoningEffortUnsupportedError(output: string): boolean {
    const text = String(output || '').toLowerCase();
    return text.includes("unexpected argument '--reasoning-effort'")
        || text.includes('unexpected argument "--reasoning-effort"');
}

export function resolveAiCliSpec(agent: string, model: string, prompt: string, reasoningEffortRaw?: string): AiCliSpec {
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
    const rawArgs = cfg.get<string[]>('ai.codex.args', ['exec', '--model', '{model}', '--reasoning-effort', '{reasoningEffort}', '{stdin}']);
    if (!Array.isArray(rawArgs) || rawArgs.length === 0) {
        throw new Error('Codex CLI args are empty. Configure intentRouter.ai.codex.args.');
    }
    const reasoningEffort = (() => {
        const normalized = String(reasoningEffortRaw || 'medium').trim().toLowerCase();
        if (normalized === 'low' || normalized === 'high' || normalized === 'extra_high' || normalized === 'medium') {
            return normalized;
        }
        return 'medium';
    })();

    let useStdinPrompt = false;
    const args = rawArgs
        .map((token) => String(token ?? ''))
        .map((token) => token.split('{model}').join(model))
        .map((token) => token.split('{reasoningEffort}').join(reasoningEffort))
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

export function normalizeOutputContract(value: any): OutputContract {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'unified_diff') {
        return 'unified_diff';
    }
    return 'path_result';
}

export function parseUnifiedDiffStrict(output: string): { diff: string; paths: string[] } {
    const normalized = stripAnsi(output);
    const blockPattern = /\[DIFF\]\s*(?:```diff\s*)?([\s\S]*?)(?:```)?\s*\[\/DIFF\]/i;
    const match = blockPattern.exec(normalized);
    if (!match) {
        return { diff: '', paths: [] };
    }
    const before = normalized.slice(0, match.index).trim();
    const after = normalized.slice(match.index + match[0].length).trim();
    if (before.length > 0 || after.length > 0) {
        throw new Error('Invalid AI output: text found outside [DIFF] block.');
    }
    const diff = String(match[1] || '').trim();
    if (!diff) {
        throw new Error('Invalid AI output: empty [DIFF] block.');
    }
    const paths: string[] = [];
    const seen = new Set<string>();
    const pathPattern = /^\+\+\+\s+b\/(.+)$/gm;
    let pathMatch: RegExpExecArray | null = null;
    while ((pathMatch = pathPattern.exec(diff)) !== null) {
        const entryPath = String(pathMatch[1] || '').trim();
        if (!entryPath || entryPath === '/dev/null') continue;
        if (seen.has(entryPath)) continue;
        seen.add(entryPath);
        paths.push(entryPath);
    }
    return { diff, paths };
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

function parseProposedChangesLenient(output: string): ProposedChange[] {
    const normalized = stripAnsi(output);
    const blockPattern = /\[PATH\]\s*([\s\S]*?)\s*\[\/PATH\]\s*\[RESULT\]\s*(?:```[\w-]*\s*)?([\s\S]*?)(?:```)?\s*\[\/RESULT\]/gi;
    const changes: ProposedChange[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = blockPattern.exec(normalized)) !== null) {
        const targetPath = String(match[1] || '').trim();
        const content = String(match[2] || '').trim();
        if (!targetPath || !content) continue;
        changes.push({ path: targetPath, content });
    }
    return changes;
}

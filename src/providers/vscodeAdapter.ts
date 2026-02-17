import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';
import * as path from 'path';
import * as fs from 'fs';
import { pipelineEventBus } from '../eventBus';

type ReviewChange = {
    path: string;
    proposal: string;
};

type PreparedReviewItem = {
    path: string;
    absolutePath: string;
    proposal: string;
    originalUri: vscode.Uri;
    proposalUri: vscode.Uri;
    added: number;
    removed: number;
};

type ReviewPolicyMode = 'warn' | 'block';
type ReviewPolicyResult = {
    mode: ReviewPolicyMode;
    blocked: boolean;
    violations: string[];
};

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

    const changes = collectReviewChanges(payload);
    if (changes.length === 0) {
        log('[Approval] Error: Missing or invalid path/proposal content.', 'stderr');
        return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const tempDir = workspaceRoot || process.env.TEMP || process.env.TMP || '/tmp';
    const tempFiles: string[] = [];
    
    try {
        log(`[Approval] Target(s): ${changes.map(change => change.path).join(', ')}`);
        
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const prepared = prepareReviewItems(changes, workspaceRoot, tempDir, tempFiles, log);
        if (prepared.length === 0) {
            throw new Error('No valid review item after preparation.');
        }

        const totalAdded = prepared.reduce((sum, item) => sum + item.added, 0);
        const totalRemoved = prepared.reduce((sum, item) => sum + item.removed, 0);
        const policy = evaluateReviewPolicy(prepared, { totalAdded, totalRemoved });

        if (policy.violations.length > 0) {
            const summary = policy.violations.join(' | ');
            log(`[Approval][Policy:${policy.mode}] ${summary}`, policy.blocked ? 'stderr' : 'stdout');
        }

        if (policy.blocked) {
            vscode.window.showErrorMessage(`Review blocked by policy: ${policy.violations.join(' | ')}`);
            return false;
        }

        if (runId) {
            pipelineEventBus.emit({
                type: 'approvalReviewReady',
                runId,
                intentId,
                stepId: nodeId,
                files: prepared.map((item) => ({
                    path: item.path,
                    added: item.added,
                    removed: item.removed
                })),
                totalAdded,
                totalRemoved,
                policyMode: policy.mode,
                policyBlocked: policy.blocked,
                policyViolations: policy.violations
            });
        }

        log('[Approval] Review summary ready. Open diffs from node, then approve/reject.');

        const decisionResult = await new Promise<{ decision: 'approve' | 'reject'; approvedPaths: string[] }>((resolve) => {
            let settled = false;
            let busy = false;
            let disposable: vscode.Disposable;
            const allPreparedPaths = prepared.map((item) => item.path);
            const timeout = setTimeout(() => {
                log('[Approval] Timeout (5m). Auto-rejecting.', 'stderr');
                if (!settled) {
                    settled = true;
                    disposable.dispose();
                    resolve({ decision: 'reject', approvedPaths: [] });
                }
            }, 300000); 
            
            const openDiff = async (targetPath?: string) => {
                if (busy) {
                    return;
                }
                busy = true;
                try {
                    if (targetPath) {
                        const selected = prepared.find((item) => normalizePathForCompare(item.path) === normalizePathForCompare(targetPath));
                        if (!selected) {
                            log(`[Approval] Requested diff not found: ${targetPath}`, 'stderr');
                            return;
                        }
                        await openDiffItem(selected);
                        log(`[Approval] Opened diff for ${selected.path}`);
                        return;
                    }
                    for (const item of prepared) {
                        await openDiffItem(item);
                    }
                    log(`[Approval] Opened ${prepared.length} diff view(s).`);
                } catch (error: any) {
                    log(`[Approval] Failed to open diff: ${String(error?.message || error)}`, 'stderr');
                } finally {
                    busy = false;
                }
            };

            disposable = pipelineEventBus.on((msg: any) => {
                if (msg.type === 'pipelineReviewOpenDiff' && msg.nodeId === nodeId && (!msg.runId || msg.runId === runId)) {
                    void openDiff(msg.path ? String(msg.path) : undefined);
                    return;
                }
                if (msg.type === 'pipelineDecision' && msg.nodeId === nodeId && (!msg.runId || msg.runId === runId)) {
                    clearTimeout(timeout);
                    if (!settled) {
                        settled = true;
                        disposable.dispose();
                        const rawApproved = Array.isArray(msg.approvedPaths) ? msg.approvedPaths : [];
                        const approvedPaths = normalizeApprovedPaths(rawApproved, allPreparedPaths);
                        resolve({ decision: msg.decision, approvedPaths });
                    }
                }
            });
        });

        if (decisionResult.decision === 'approve') {
            const approvedItems = selectApprovedPreparedItems(prepared, decisionResult.approvedPaths);
            if (approvedItems.length === 0) {
                log('[Approval] APPROVED with 0 selected file. No change applied.');
                vscode.window.showWarningMessage('Approval received, but no file selected. No changes applied.');
                return false;
            }

            for (const item of approvedItems) {
                const dir = path.dirname(item.absolutePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(item.absolutePath, item.proposal, { encoding: 'utf8' });
            }
            vscode.window.showInformationMessage(`Successfully updated ${approvedItems.length}/${prepared.length} file(s).`);
            return true;
        } else {
            log('[Approval] REJECTED. No changes made.');
            vscode.window.showWarningMessage(`Change rejected for ${changes.length} file(s).`);
            return false;
        }

    } catch (error: any) {
        log(`[Approval] Error: ${error.message}`, 'stderr');
        return false;
    } finally {
        for (const tempFilePath of tempFiles) {
            try {
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            } catch {
                // best effort cleanup
            }
        }
    }
}

function normalizeApprovedPaths(rawApproved: string[], fallbackAll: string[]): string[] {
    if (!Array.isArray(rawApproved) || rawApproved.length === 0) {
        return fallbackAll;
    }
    const allow = new Set(fallbackAll.map(normalizePathForCompare));
    const approved: string[] = [];
    for (const candidate of rawApproved) {
        const key = normalizePathForCompare(candidate);
        if (!key || !allow.has(key)) {
            continue;
        }
        const exact = fallbackAll.find((pathValue) => normalizePathForCompare(pathValue) === key);
        if (exact && !approved.includes(exact)) {
            approved.push(exact);
        }
    }
    return approved;
}

function selectApprovedPreparedItems(prepared: PreparedReviewItem[], approvedPaths: string[]): PreparedReviewItem[] {
    const allowed = new Set(approvedPaths.map(normalizePathForCompare));
    return prepared.filter((item) => allowed.has(normalizePathForCompare(item.path)));
}

function prepareReviewItems(
    changes: ReviewChange[],
    workspaceRoot: string | undefined,
    tempDir: string,
    tempFiles: string[],
    log: (text: string, stream?: 'stdout' | 'stderr') => void
): PreparedReviewItem[] {
    const prepared: PreparedReviewItem[] = [];
    for (const change of changes) {
        const absolutePath = path.isAbsolute(change.path) ? change.path : (workspaceRoot ? path.join(workspaceRoot, change.path) : change.path);
        const tempProposalPath = path.join(tempDir, `proposal_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
        fs.writeFileSync(tempProposalPath, change.proposal, { encoding: 'utf8', flag: 'w' });
        tempFiles.push(tempProposalPath);
        if (!fs.existsSync(tempProposalPath)) {
            throw new Error(`Failed to create temp proposal file at ${tempProposalPath}`);
        }

        let originalUri: vscode.Uri;
        let currentContent = '';
        if (fs.existsSync(absolutePath)) {
            originalUri = vscode.Uri.file(absolutePath);
            currentContent = fs.readFileSync(absolutePath, 'utf8');
        } else {
            log(`[Approval] New file detected: ${change.path}`);
            const tempEmptyOriginal = path.join(tempDir, `original_empty_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
            fs.writeFileSync(tempEmptyOriginal, '', { encoding: 'utf8', flag: 'w' });
            tempFiles.push(tempEmptyOriginal);
            originalUri = vscode.Uri.file(tempEmptyOriginal);
        }

        const stats = computeLineStats(currentContent, change.proposal);
        prepared.push({
            path: change.path,
            absolutePath,
            proposal: change.proposal,
            originalUri,
            proposalUri: vscode.Uri.file(tempProposalPath),
            added: stats.added,
            removed: stats.removed
        });
    }
    return prepared;
}

async function openDiffItem(item: PreparedReviewItem): Promise<void> {
    await vscode.commands.executeCommand(
        'vscode.diff',
        item.originalUri,
        item.proposalUri,
        `Review: ${path.basename(item.path)} (+${item.added} -${item.removed})`
    );
}

function normalizePathForCompare(value: string): string {
    return String(value || '').replace(/\\/g, '/').trim().toLowerCase();
}

function computeLineStats(beforeText: string, afterText: string): { added: number; removed: number } {
    const before = beforeText.replace(/\r\n/g, '\n').split('\n');
    const after = afterText.replace(/\r\n/g, '\n').split('\n');
    const beforeLen = before.length;
    const afterLen = after.length;
    if (beforeLen === 1 && before[0] === '') {
        return { added: afterLen === 1 && after[0] === '' ? 0 : afterLen, removed: 0 };
    }
    if (afterLen === 1 && after[0] === '') {
        return { added: 0, removed: beforeLen === 1 && before[0] === '' ? 0 : beforeLen };
    }

    const lcsMatrix: number[][] = Array.from({ length: beforeLen + 1 }, () => Array(afterLen + 1).fill(0));
    for (let i = 1; i <= beforeLen; i += 1) {
        for (let j = 1; j <= afterLen; j += 1) {
            if (before[i - 1] === after[j - 1]) {
                lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
            } else {
                lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
            }
        }
    }
    const lcsLength = lcsMatrix[beforeLen][afterLen];
    return {
        added: Math.max(0, afterLen - lcsLength),
        removed: Math.max(0, beforeLen - lcsLength)
    };
}

export function evaluateReviewPolicy(
    prepared: PreparedReviewItem[],
    totals: { totalAdded: number; totalRemoved: number }
): ReviewPolicyResult {
    const modeRaw = vscode.workspace.getConfiguration('intentRouter').get<string>('policy.review.mode', 'warn');
    const mode: ReviewPolicyMode = modeRaw === 'block' ? 'block' : 'warn';
    const blockedPathPatterns = vscode.workspace.getConfiguration('intentRouter').get<string[]>('policy.review.blockedPaths', []);
    const blockedExtensions = (vscode.workspace.getConfiguration('intentRouter').get<string[]>('policy.review.blockedExtensions', []) || [])
        .map((value) => normalizeExt(value))
        .filter(Boolean);
    const maxChangedLinesRaw = vscode.workspace.getConfiguration('intentRouter').get<number>('policy.review.maxChangedLines', 0);
    const maxChangedLines = Number.isFinite(maxChangedLinesRaw) ? Math.max(0, Math.floor(maxChangedLinesRaw)) : 0;

    const violations: string[] = [];
    for (const item of prepared) {
        const normalizedPath = normalizePathForCompare(item.path);
        if (matchesBlockedPath(normalizedPath, blockedPathPatterns)) {
            violations.push(`blocked path: ${item.path}`);
        }
        const ext = normalizeExt(path.extname(item.path));
        if (ext && blockedExtensions.includes(ext)) {
            violations.push(`blocked extension (${ext}): ${item.path}`);
        }
    }

    const changedLines = totals.totalAdded + totals.totalRemoved;
    if (maxChangedLines > 0 && changedLines > maxChangedLines) {
        violations.push(`changed lines ${changedLines} exceeds max ${maxChangedLines}`);
    }

    const blocked = mode === 'block' && violations.length > 0;
    return { mode, blocked, violations };
}

function matchesBlockedPath(normalizedPath: string, patterns: string[]): boolean {
    for (const patternRaw of patterns || []) {
        const pattern = String(patternRaw || '').trim();
        if (!pattern) continue;
        const regex = globPatternToRegex(pattern);
        if (regex.test(normalizedPath)) {
            return true;
        }
    }
    return false;
}

function globPatternToRegex(pattern: string): RegExp {
    const normalized = normalizePathForCompare(pattern);
    const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const wildcard = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${wildcard}$`, 'i');
}

function normalizeExt(value: string): string {
    const trimmed = String(value || '').trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function collectReviewChanges(payload: any): ReviewChange[] {
    const fromPayloadChanges = normalizeChangesArray(payload?.changes);
    if (fromPayloadChanges.length > 0) {
        return fromPayloadChanges;
    }

    const proposal = payload?.proposal;
    if (typeof proposal === 'string') {
        const parsedProposal = parseStructuredProposal(proposal);
        if (parsedProposal.length > 0) {
            return parsedProposal;
        }
    }

    const pathValue = String(payload?.path || '').trim();
    if (!pathValue || proposal === undefined || proposal === null) {
        return [];
    }
    return [{ path: pathValue, proposal: String(proposal) }];
}

function parseStructuredProposal(rawProposal: string): ReviewChange[] {
    const trimmed = rawProposal.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return normalizeChangesArray(parsed);
        }
        if (parsed && typeof parsed === 'object') {
            if (Array.isArray((parsed as any).changes)) {
                return normalizeChangesArray((parsed as any).changes);
            }
            const onePath = String((parsed as any).path || '').trim();
            const oneContent = (parsed as any).content;
            if (onePath && oneContent !== undefined && oneContent !== null) {
                return [{ path: onePath, proposal: String(oneContent) }];
            }
        }
    } catch {
        return [];
    }
    return [];
}

function normalizeChangesArray(input: any): ReviewChange[] {
    if (!Array.isArray(input)) {
        return [];
    }
    const normalized: ReviewChange[] = [];
    for (const item of input) {
        const itemPath = String(item?.path || '').trim();
        const content = item?.content;
        if (!itemPath || content === undefined || content === null) {
            continue;
        }
        normalized.push({
            path: itemPath,
            proposal: String(content)
        });
    }
    return normalized;
}

export async function installExtensions(payload: any): Promise<void> {
    const rawExtensions = payload?.extensions;
    if (!rawExtensions) return;
    if (!Array.isArray(rawExtensions) && typeof rawExtensions !== 'string') return;
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

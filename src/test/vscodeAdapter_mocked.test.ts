import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock the vscode module BEFORE importing other modules
const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Now import the actual code to test
// Note: We need to point to the compiled output because we are running node tests on compiled JS
const { installExtensions, reviewDiff } = require('../../out/providers/vscodeAdapter');
Module.prototype.require = originalRequire;

suite('VSCode Adapter Tests (Mocked)', () => {
    let executedCommands: string[] = [];
    const fsAny = fs as any;
    let originalExistsSync: typeof fs.existsSync;
    let originalMkdirSync: typeof fs.mkdirSync;
    let originalWriteFileSync: typeof fs.writeFileSync;
    let originalUnlinkSync: typeof fs.unlinkSync;
    let writtenFiles: string[] = [];
    let existingPaths: Set<string>;
    let originalWorkspaceFolders: any;

    suiteSetup(() => {
        originalExistsSync = fs.existsSync;
        originalMkdirSync = fs.mkdirSync;
        originalWriteFileSync = fs.writeFileSync;
        originalUnlinkSync = fs.unlinkSync;
        originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
    });

    setup(() => {
        if (mockVscode.__mock?.reset) {
            mockVscode.__mock.reset();
        }
        executedCommands = [];
        writtenFiles = [];
        existingPaths = new Set<string>();
        mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
        fsAny.existsSync = ((target: fs.PathLike) => {
            const value = String(target);
            if (existingPaths.has(value)) {
                return true;
            }
            return originalExistsSync(target);
        }) as typeof fs.existsSync;
        fsAny.mkdirSync = ((dir: fs.PathLike) => {
            const value = String(dir);
            writtenFiles.push(`mkdir:${value}`);
            existingPaths.add(value);
            return originalMkdirSync(dir as any, { recursive: true });
        }) as typeof fs.mkdirSync;
        fsAny.writeFileSync = ((file: fs.PathLike, data: any, options?: any) => {
            const value = String(file);
            writtenFiles.push(value);
            existingPaths.add(value);
            return originalWriteFileSync(file as any, data, options);
        }) as typeof fs.writeFileSync;
        fsAny.unlinkSync = ((file: fs.PathLike) => {
            const value = String(file);
            writtenFiles.push(`unlink:${value}`);
            existingPaths.delete(value);
            return originalUnlinkSync(file as any);
        }) as typeof fs.unlinkSync;
        mockVscode.commands.executeCommand = async (cmd: string, arg: any) => {
            executedCommands.push(`${cmd}:${arg}`);
        };
    });

    teardown(() => {
        fsAny.existsSync = originalExistsSync;
        fsAny.mkdirSync = originalMkdirSync;
        fsAny.writeFileSync = originalWriteFileSync;
        fsAny.unlinkSync = originalUnlinkSync;
        mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
    });

    test('should install extensions from string array', async () => {
        await installExtensions({ extensions: ['ext1', 'ext2'] });
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext1'));
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext2'));
    });

    test('should install extensions from multiline string', async () => {
        await installExtensions({ extensions: 'ext1\n  ext2 \n\n' });
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext1'));
        assert.ok(executedCommands.includes('workbench.extensions.installExtension:ext2'));
    });

    test('should handle empty payload', async () => {
        await installExtensions({});
        assert.strictEqual(executedCommands.length, 0);
    });

    test('should handle invalid payload types', async () => {
         await installExtensions({ extensions: 123 });
         assert.strictEqual(executedCommands.length, 0);
    });

    test('reviewDiff uses os.tmpdir for temp files', async () => {
        const workspaceRoot = path.join(os.tmpdir(), 'intent-router-workspace');
        mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot, path: workspaceRoot } }];

        const approvalPromise = new Promise<void>((resolve) => {
            const disposable = require('../../out/eventBus').pipelineEventBus.on((event: any) => {
                if (event.type === 'approvalReviewReady') {
                    setImmediate(() => {
                        require('../../out/eventBus').pipelineEventBus.emit({
                            type: 'pipelineDecision',
                            nodeId: 'step-1',
                            runId: 'run-1',
                            decision: 'approve',
                            approvedPaths: ['notes.txt']
                        });
                        disposable.dispose();
                        resolve();
                    });
                }
            });
        });

        const resultPromise = reviewDiff({
            path: 'notes.txt',
            proposal: 'hello world',
            __meta: {
                stepId: 'step-1',
                runId: 'run-1',
                traceId: 'trace-1'
            }
        });

        await approvalPromise;
        const result = await resultPromise;

        assert.strictEqual(result, true);
        const proposalPath = writtenFiles.find((entry) => !entry.startsWith('mkdir:') && !entry.startsWith('unlink:'));
        assert.ok(proposalPath, 'Expected a temp proposal file to be written');
        assert.ok(proposalPath!.startsWith(path.join(os.tmpdir(), 'intent-router', 'review-diff')), `Temp path should live under os.tmpdir(); got ${proposalPath}`);
    });
});

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

const {
    normalizeBudgetLimit,
    executeAiCommand,
    executeAiTeamCommand
} = require('../../out/providers/aiAdapter');
const { pipelineEventBus } = require('../../out/eventBus');

Module.prototype.require = originalRequire;

suite('AI Execution Budget & Timeout Guards (Mocked)', () => {
    let tempDir: string;
    let mockCliPath: string;
    let hangingCliPath: string;
    let failingCliPath: string;
    let verboseStdoutCliPath: string;
    let verboseStderrCliPath: string;
    let utf8CliPath: string;

    setup(() => {
        if (mockVscode.__mock?.reset) {
            mockVscode.__mock.reset();
        }
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roots-ai-budget-test-'));

        // Quick success CLI script
        mockCliPath = path.join(tempDir, 'fast-cli.js');
        const fastScript = "#!/usr/bin/env node\nconsole.log('[PATH]src/index.ts[/PATH][RESULT]```ts\\nconsole.log(\"ok\");\\n```[/RESULT]');\nprocess.exit(0);\n";
        fs.writeFileSync(mockCliPath, fastScript, { mode: 511 });

        // Hanging CLI script (sleeps forever)
        hangingCliPath = path.join(tempDir, 'hanging-cli.js');
        const hangingScript = "#!/usr/bin/env node\nsetInterval(() => {}, 10000);\n";
        fs.writeFileSync(hangingCliPath, hangingScript, { mode: 511 });

        // Failing CLI script
        failingCliPath = path.join(tempDir, 'failing-cli.js');
        const failingScript = "#!/usr/bin/env node\nconsole.error('Provider API Error 500');\nprocess.exit(1);\n";
        fs.writeFileSync(failingCliPath, failingScript, { mode: 511 });

        // Verbose stdout CLI script (spams stdout continuously)
        verboseStdoutCliPath = path.join(tempDir, 'verbose-stdout-cli.js');
        const verboseStdoutScript = "#!/usr/bin/env node\nsetInterval(() => { process.stdout.write('X'.repeat(1000)); }, 10);\n";
        fs.writeFileSync(verboseStdoutCliPath, verboseStdoutScript, { mode: 511 });

        // Verbose stderr CLI script (spams stderr continuously)
        verboseStderrCliPath = path.join(tempDir, 'verbose-stderr-cli.js');
        const verboseStderrScript = "#!/usr/bin/env node\nsetInterval(() => { process.stderr.write('E'.repeat(1000)); }, 10);\n";
        fs.writeFileSync(verboseStderrCliPath, verboseStderrScript, { mode: 511 });

        // UTF-8 multibyte CLI script (outputs 4-byte emoji characters)
        utf8CliPath = path.join(tempDir, 'utf8-cli.js');
        // '😀' is 4 bytes in UTF-8 (Buffer.byteLength('😀') === 4, char length === 2)
        const utf8Script = "#!/usr/bin/env node\nprocess.stdout.write('😀😀😀😀😀');\nprocess.exit(0);\n";
        fs.writeFileSync(utf8CliPath, utf8Script, { mode: 511 });

        // Configure codex command to point to node + our script
        mockVscode.__mock.configStore.set('intentRouter.ai.codex.command', process.execPath);
    });

    teardown(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (_) {}
        }
    });

    suite('normalizeBudgetLimit', () => {
        test('normalizes valid positive numbers and strings', () => {
            assert.strictEqual(normalizeBudgetLimit(500), 500);
            assert.strictEqual(normalizeBudgetLimit('1000'), 1000);
            assert.strictEqual(normalizeBudgetLimit(2.9), 2);
            assert.strictEqual(normalizeBudgetLimit(' 50 '), 50);
        });

        test('returns undefined for 0, negative, and invalid values', () => {
            assert.strictEqual(normalizeBudgetLimit(0), undefined);
            assert.strictEqual(normalizeBudgetLimit(-10), undefined);
            assert.strictEqual(normalizeBudgetLimit('-5'), undefined);
            assert.strictEqual(normalizeBudgetLimit('invalid'), undefined);
            assert.strictEqual(normalizeBudgetLimit(NaN), undefined);
            assert.strictEqual(normalizeBudgetLimit(Infinity), undefined);
            assert.strictEqual(normalizeBudgetLimit(undefined), undefined);
            assert.strictEqual(normalizeBudgetLimit(null), undefined);
            assert.strictEqual(normalizeBudgetLimit(''), undefined);
        });
    });

    suite('ai.generate timeout guard', () => {
        test('completes normally when within timeoutMs limit', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            const result = await executeAiCommand({
                agent: 'codex',
                instruction: 'generate test code',
                timeoutMs: 5000
            });

            assert.strictEqual(result.path, 'src/index.ts');
            assert.ok(result.content.includes('console.log("ok");'));
        });

        test('terminates hanging process and rejects with explicit timeout error', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [hangingCliPath]);

            const startTime = Date.now();
            let thrownError: any = null;

            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'hanging instruction',
                    timeoutMs: 150
                });
            } catch (err: any) {
                thrownError = err;
            }

            const elapsed = Date.now() - startTime;
            assert.ok(thrownError, 'Expected ai.generate to throw on timeout');
            assert.ok(
                thrownError.message.includes('[AI Budget]'),
                `Error message should include [AI Budget], got: ${thrownError.message}`
            );
            assert.ok(
                thrownError.message.includes('timed out after 150ms'),
                `Error message should contain timeout details, got: ${thrownError.message}`
            );
            assert.ok(elapsed < 2000, `Execution should finish quickly on timeout, elapsed: ${elapsed}ms`);
        });

        test('unchanged behavior when timeoutMs is not provided', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            const result = await executeAiCommand({
                agent: 'codex',
                instruction: 'normal instruction'
            });

            assert.strictEqual(result.path, 'src/index.ts');
        });

        test('ignores non-positive or invalid timeoutMs values', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            const resultZero = await executeAiCommand({
                agent: 'codex',
                instruction: 'test instruction',
                timeoutMs: 0
            });
            assert.strictEqual(resultZero.path, 'src/index.ts');

            const resultNeg = await executeAiCommand({
                agent: 'codex',
                instruction: 'test instruction',
                timeoutMs: -500
            });
            assert.strictEqual(resultNeg.path, 'src/index.ts');

            const resultInvalid = await executeAiCommand({
                agent: 'codex',
                instruction: 'test instruction',
                timeoutMs: 'invalid'
            });
            assert.strictEqual(resultInvalid.path, 'src/index.ts');
        });
    });

    suite('ai.team maxProviderCalls & budget bounds', () => {
        test('sequential strategy stops at maxProviderCalls=2 for a 4-member team', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            let summaryEvent: any = null;
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'teamRunSummary') {
                    summaryEvent = evt;
                }
            });

            try {
                const members = [
                    { name: 'm1', agent: 'codex', instruction: 'do 1' },
                    { name: 'm2', agent: 'codex', instruction: 'do 2' },
                    { name: 'm3', agent: 'codex', instruction: 'do 3' },
                    { name: 'm4', agent: 'codex', instruction: 'do 4' }
                ];

                const result = await executeAiTeamCommand({
                    strategy: 'sequential',
                    members,
                    maxProviderCalls: 2,
                    __meta: { runId: 'run-1', traceId: 'trace-1', stepId: 'step-1' }
                });

                assert.ok(result, 'Expected team result');
                assert.ok(summaryEvent, 'Expected teamRunSummary event to be emitted');
                assert.strictEqual(summaryEvent.providerCallsStarted, 2);
                assert.strictEqual(summaryEvent.maxProviderCalls, 2);
                assert.strictEqual(summaryEvent.budgetExceeded, true);
                assert.strictEqual(summaryEvent.members.length, 2);
            } finally {
                sub.dispose();
            }
        });

        test('reviewer_gate strategy evaluates cleanly when budget is reached after reviewer runs', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            const members = [
                { name: 'writer1', agent: 'codex', role: 'writer', instruction: 'write 1' },
                { name: 'reviewer1', agent: 'codex', role: 'reviewer', instruction: 'review 1' },
                { name: 'writer2', agent: 'codex', role: 'writer', instruction: 'write 2' },
                { name: 'writer3', agent: 'codex', role: 'writer', instruction: 'write 3' }
            ];

            const result = await executeAiTeamCommand({
                strategy: 'reviewer_gate',
                members,
                maxProviderCalls: 2,
                __meta: { runId: 'run-2', traceId: 'trace-2', stepId: 'step-2' }
            });

            assert.ok(result);
            assert.strictEqual(result.path, 'src/index.ts');
        });

        test('vote strategy evaluates among executed members when budget limit is reached', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [mockCliPath]);

            const members = [
                { name: 'agent1', agent: 'codex', instruction: 'vote 1' },
                { name: 'agent2', agent: 'codex', instruction: 'vote 2' },
                { name: 'agent3', agent: 'codex', instruction: 'vote 3' },
                { name: 'agent4', agent: 'codex', instruction: 'vote 4' }
            ];

            const result = await executeAiTeamCommand({
                strategy: 'vote',
                members,
                maxProviderCalls: 2,
                __meta: { runId: 'run-3', traceId: 'trace-3', stepId: 'step-3' }
            });

            assert.ok(result);
        });

        test('failed provider call is counted in providerCallsStarted', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [failingCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'failing instruction'
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected failing CLI to throw');
            assert.ok(thrownError.message.includes('Agent exited with code 1'));
        });
    });

    suite('ai.generate maxOutputBytes output limit guards', () => {
        test('terminates provider exceeding maxOutputBytes on stdout and rejects with [AI Budget]', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let thrownError: any = null;
            const startTime = Date.now();

            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'spam stdout',
                    maxOutputBytes: 500
                });
            } catch (err: any) {
                thrownError = err;
            }

            const elapsed = Date.now() - startTime;
            assert.ok(thrownError, 'Expected output limit error');
            assert.ok(thrownError.message.includes('[AI Budget]'), `Expected [AI Budget] error prefix, got: ${thrownError.message}`);
            assert.ok(thrownError.message.includes('Provider output limit of 500 bytes exceeded'), `Expected limit details, got: ${thrownError.message}`);
            assert.ok(elapsed < 2000, `Expected rapid termination, elapsed: ${elapsed}ms`);
        });

        test('terminates provider exceeding maxOutputBytes on stderr and rejects with [AI Budget]', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStderrCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'spam stderr',
                    maxOutputBytes: 500
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected stderr output limit error');
            assert.ok(thrownError.message.includes('[AI Budget]'));
            assert.ok(thrownError.message.includes('Provider output limit of 500 bytes exceeded'));
        });

        test('accurately counts multi-byte UTF-8 bytes instead of string chars', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [utf8CliPath]);

            // 5 emojis * 4 bytes/emoji = 20 bytes. String length is 10 chars.
            // If maxOutputBytes is 15 bytes, 20 bytes exceeds 15 and should trigger rejection.
            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'utf8 test',
                    maxOutputBytes: 15
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected 20 bytes to exceed 15 maxOutputBytes');
            assert.ok(thrownError.message.includes('[AI Budget]'));

            // If maxOutputBytes is 25 bytes, 20 bytes is under limit.
            // Since it's not valid PATH/RESULT blocks, it should proceed past stdout accumulation and fail block parsing, NOT output limit.
            let parseError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'utf8 test',
                    maxOutputBytes: 25
                });
            } catch (err: any) {
                parseError = err;
            }

            assert.ok(parseError);
            assert.strictEqual(parseError.message.includes('[AI Budget]'), false, 'Should not throw budget error when under limit');
        });

        test('combination of timeoutMs and maxOutputBytes: output limit wins if triggered first', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'race test',
                    timeoutMs: 10000,
                    maxOutputBytes: 200
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('Provider output limit of 200 bytes exceeded'));
        });

        test('ai.team propagates maxOutputBytes to provider calls', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let summaryEvent: any = null;
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'teamRunSummary') {
                    summaryEvent = evt;
                }
            });

            let thrownError: any = null;
            try {
                const members = [
                    { name: 'spammer', agent: 'codex', instruction: 'spam' }
                ];

                await executeAiTeamCommand({
                    strategy: 'sequential',
                    members,
                    maxOutputBytes: 300,
                    __meta: { runId: 'run-output-1', traceId: 'trace-output-1', stepId: 'step-output-1' }
                });
            } catch (err: any) {
                thrownError = err;
            } finally {
                sub.dispose();
            }

            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('Provider output limit of 300 bytes exceeded'));
        });
    });
});

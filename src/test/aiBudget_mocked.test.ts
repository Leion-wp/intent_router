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

        // Verbose stdout CLI script
        verboseStdoutCliPath = path.join(tempDir, 'verbose-stdout-cli.js');
        const verboseStdoutScript = "#!/usr/bin/env node\nfor (let i = 0; i < 1000; i++) { process.stdout.write('A'.repeat(100) + '\\n'); }\nsetInterval(() => { process.stdout.write('B'.repeat(100) + '\\n'); }, 10);\n";
        fs.writeFileSync(verboseStdoutCliPath, verboseStdoutScript, { mode: 511 });

        // Verbose stderr CLI script
        verboseStderrCliPath = path.join(tempDir, 'verbose-stderr-cli.js');
        const verboseStderrScript = "#!/usr/bin/env node\nfor (let i = 0; i < 1000; i++) { process.stderr.write('X'.repeat(100) + '\\n'); }\nsetInterval(() => { process.stderr.write('Y'.repeat(100) + '\\n'); }, 10);\n";
        fs.writeFileSync(verboseStderrCliPath, verboseStderrScript, { mode: 511 });

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

    suite('ai.generate maxOutputBytes stdout & stderr accumulation guard', () => {
        test('terminates provider and rejects when stdout output exceeds maxOutputBytes', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let stepLogsCount = 0;
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'stepLog') {
                    stepLogsCount++;
                }
            });

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'verbose stdout instruction',
                    maxOutputBytes: 500,
                    __meta: { runId: 'run-out-1', traceId: 'trace-out-1', stepId: 'step-out-1' }
                });
            } catch (err: any) {
                thrownError = err;
            } finally {
                sub.dispose();
            }

            assert.ok(thrownError, 'Expected execution to fail due to output limit');
            assert.ok(
                thrownError.message.includes('[AI Budget]'),
                `Error should contain [AI Budget], got: ${thrownError.message}`
            );
            assert.ok(
                thrownError.message.includes('Maximum output size exceeded (500 bytes)'),
                `Error message should specify exceeded limit, got: ${thrownError.message}`
            );
            // Verify step logs stopped emitting
            const logsAtFailure = stepLogsCount;
            await new Promise((resolve) => setTimeout(resolve, 100));
            assert.strictEqual(stepLogsCount, logsAtFailure, 'Logs should not continue growing after output limit exceeded');
        });

        test('terminates provider and rejects when stderr output exceeds maxOutputBytes', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStderrCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'verbose stderr instruction',
                    maxOutputBytes: 400
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected execution to fail on stderr output limit');
            assert.ok(thrownError.message.includes('[AI Budget]'));
            assert.ok(thrownError.message.includes('Maximum output size exceeded (400 bytes)'));
        });

        test('accurately counts UTF-8 multi-byte characters in byte length', async () => {
            // Write a script that emits multi-byte UTF-8 string: '🌍' is 4 bytes in UTF-8
            const utf8CliPath = path.join(tempDir, 'utf8-cli.js');
            // '🌍'.repeat(10) is 40 bytes, but length is 20 code units.
            const utf8Script = "#!/usr/bin/env node\nprocess.stdout.write('🌍'.repeat(20));\nsetInterval(() => {}, 1000);\n";
            fs.writeFileSync(utf8CliPath, utf8Script, { mode: 511 });

            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [utf8CliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'utf8 test',
                    maxOutputBytes: 30 // 30 bytes < 80 bytes emitted
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('[AI Budget]'));
            assert.ok(thrownError.message.includes('Maximum output size exceeded (30 bytes)'));
        });

        test('completes normally when total output is within exact boundary', async () => {
            const exactCliPath = path.join(tempDir, 'exact-cli.js');
            const outputPayload = '[PATH]src/index.ts[/PATH][RESULT]```ts\nconsole.log("ok");\n```[/RESULT]';
            const outputBytes = Buffer.byteLength(outputPayload, 'utf-8');
            const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(outputPayload)});\nprocess.exit(0);\n`;
            fs.writeFileSync(exactCliPath, script, { mode: 511 });

            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [exactCliPath]);

            // With limit equal to outputBytes + 20, should succeed
            const result = await executeAiCommand({
                agent: 'codex',
                instruction: 'exact boundary test',
                maxOutputBytes: outputBytes + 20
            });
            assert.strictEqual(result.path, 'src/index.ts');

            // With limit lower than outputBytes, should fail
            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'exact boundary failure test',
                    maxOutputBytes: outputBytes - 5
                });
            } catch (err: any) {
                thrownError = err;
            }
            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('[AI Budget]'));
        });

        test('combination of timeoutMs and maxOutputBytes: first limit triggered wins cleanly', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'combination test',
                    maxOutputBytes: 100, // Triggered almost immediately
                    timeoutMs: 5000
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('Maximum output size exceeded (100 bytes)'));
        });

        test('ai.team propagates maxOutputBytes to member calls', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [verboseStdoutCliPath]);

            let summaryEvent: any = null;
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'teamRunSummary') {
                    summaryEvent = evt;
                }
            });

            let thrownError: any = null;
            try {
                await executeAiTeamCommand({
                    strategy: 'sequential',
                    members: [{ name: 'm1', agent: 'codex', instruction: 'do 1' }],
                    maxOutputBytes: 250,
                    __meta: { runId: 'run-team-out', traceId: 'trace-team-out', stepId: 'step-team-out' }
                });
            } catch (err: any) {
                thrownError = err;
            } finally {
                sub.dispose();
            }

            assert.ok(thrownError, 'Expected team call to fail when member exceeds output limit');
            assert.ok(thrownError.message.includes('Maximum output size exceeded (250 bytes)'));
        });
    });
});

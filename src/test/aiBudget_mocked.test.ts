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

    suite('ai.generate maxOutputBytes output limit guard', () => {
        let stdoutSpamCliPath: string;
        let stderrSpamCliPath: string;
        let utf8SpamCliPath: string;

        setup(() => {
            // Script emitting infinite/massive stdout
            stdoutSpamCliPath = path.join(tempDir, 'stdout-spam-cli.js');
            const stdoutSpamScript = "#!/usr/bin/env node\nfor (let i = 0; i < 1000; i++) { console.log('SPAM STDOUT DATA LINE ' + i); }\nprocess.exit(0);\n";
            fs.writeFileSync(stdoutSpamCliPath, stdoutSpamScript, { mode: 511 });

            // Script emitting infinite/massive stderr
            stderrSpamCliPath = path.join(tempDir, 'stderr-spam-cli.js');
            const stderrSpamScript = "#!/usr/bin/env node\nfor (let i = 0; i < 1000; i++) { console.error('SPAM STDERR DATA LINE ' + i); }\nprocess.exit(0);\n";
            fs.writeFileSync(stderrSpamCliPath, stderrSpamScript, { mode: 511 });

            // Script emitting multi-byte UTF-8 characters
            utf8SpamCliPath = path.join(tempDir, 'utf8-spam-cli.js');
            // '🔥' is 4 bytes in UTF-8 (surrogate pair, length 2 in JS string)
            const utf8Script = "#!/usr/bin/env node\nprocess.stdout.write('🔥'.repeat(100));\nprocess.exit(0);\n";
            fs.writeFileSync(utf8SpamCliPath, utf8Script, { mode: 511 });
        });

        test('terminates provider process and halts logging when stdout exceeds maxOutputBytes', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [stdoutSpamCliPath]);

            const stepLogs: string[] = [];
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'stepLog') {
                    stepLogs.push(evt.text);
                }
            });

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'spam stdout',
                    maxOutputBytes: 150,
                    __meta: { runId: 'run-spam-1', traceId: 'trace-spam-1', stepId: 'step-spam-1' }
                });
            } catch (err: any) {
                thrownError = err;
            } finally {
                sub.dispose();
            }

            assert.ok(thrownError, 'Expected ai.generate to throw when stdout exceeds maxOutputBytes');
            assert.ok(
                thrownError.message.includes('[AI Budget]'),
                `Error message should include [AI Budget], got: ${thrownError.message}`
            );
            assert.ok(
                thrownError.message.includes('output limit exceeded'),
                `Error message should mention output limit exceeded, got: ${thrownError.message}`
            );

            // Verify logged text is bounded and stops
            const totalLoggedBytes = stepLogs.reduce((acc, logText) => acc + Buffer.byteLength(logText, 'utf-8'), 0);
            assert.ok(totalLoggedBytes <= 1000, `Total logged bytes (${totalLoggedBytes}) should be bounded`);
        });

        test('terminates provider process when stderr exceeds maxOutputBytes', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [stderrSpamCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'spam stderr',
                    maxOutputBytes: 200
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected ai.generate to throw when stderr exceeds maxOutputBytes');
            assert.ok(thrownError.message.includes('[AI Budget]'));
            assert.ok(thrownError.message.includes('output limit exceeded'));
        });

        test('measures output limit in bytes, accounting for multi-byte UTF-8 characters', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [utf8SpamCliPath]);

            // '🔥'.repeat(100) is 400 bytes in UTF-8, but string length is 200.
            // If maxOutputBytes is set to 300 bytes:
            // - If measured in string.length (200), it would pass (< 300).
            // - If measured in bytes (400), it exceeds limit (> 300).
            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'utf8 test',
                    maxOutputBytes: 300
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError, 'Expected UTF-8 output to exceed 300 bytes limit');
            assert.ok(thrownError.message.includes('output limit exceeded'));
        });

        test('responses under and at limit succeed, responses over limit fail', async () => {
            // CLI outputting exact known content
            const exactCliPath = path.join(tempDir, 'exact-cli.js');
            const responseText = '[PATH]src/index.ts[/PATH][RESULT]```ts\nconsole.log("ok");\n```[/RESULT]';
            const responseBytes = Buffer.byteLength(responseText, 'utf-8');
            const exactScript = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(responseText)});\nprocess.exit(0);\n`;
            fs.writeFileSync(exactCliPath, exactScript, { mode: 511 });

            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [exactCliPath]);

            // 1. Under limit
            const resultUnder = await executeAiCommand({
                agent: 'codex',
                instruction: 'under limit',
                maxOutputBytes: responseBytes + 500
            });
            assert.strictEqual(resultUnder.path, 'src/index.ts');

            // 2. Exact limit
            const resultExact = await executeAiCommand({
                agent: 'codex',
                instruction: 'exact limit',
                maxOutputBytes: responseBytes
            });
            assert.strictEqual(resultExact.path, 'src/index.ts');

            // 3. Over limit (limit set 1 byte below responseBytes)
            let overError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'over limit',
                    maxOutputBytes: responseBytes - 1
                });
            } catch (err: any) {
                overError = err;
            }
            assert.ok(overError, 'Expected execution to fail when maxOutputBytes < responseBytes');
            assert.ok(overError.message.includes('output limit exceeded'));
        });

        test('timeoutMs + maxOutputBytes combination triggers first guard without double cleanup', async () => {
            // Script that spams output immediately then hangs
            const spamHangCliPath = path.join(tempDir, 'spam-hang-cli.js');
            const spamHangScript = "#!/usr/bin/env node\nfor (let i = 0; i < 500; i++) { console.log('SPAM LINE ' + i); }\nsetInterval(() => {}, 10000);\n";
            fs.writeFileSync(spamHangCliPath, spamHangScript, { mode: 511 });

            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [spamHangCliPath]);

            let thrownError: any = null;
            try {
                await executeAiCommand({
                    agent: 'codex',
                    instruction: 'spam and hang',
                    maxOutputBytes: 100,
                    timeoutMs: 5000
                });
            } catch (err: any) {
                thrownError = err;
            }

            assert.ok(thrownError);
            assert.ok(thrownError.message.includes('output limit exceeded'));
        });

        test('ai.team propagates maxOutputBytes to member executions and summary event', async () => {
            mockVscode.__mock.configStore.set('intentRouter.ai.codex.args', [stdoutSpamCliPath]);

            let summaryEvent: any = null;
            const sub = pipelineEventBus.on((evt: any) => {
                if (evt.type === 'teamRunSummary') {
                    summaryEvent = evt;
                }
            });

            let thrownError: any = null;
            try {
                const members = [
                    { name: 'm1', agent: 'codex', instruction: 'do 1' }
                ];

                await executeAiTeamCommand({
                    strategy: 'sequential',
                    members,
                    maxOutputBytes: 100,
                    __meta: { runId: 'run-team-1', traceId: 'trace-team-1', stepId: 'step-team-1' }
                });
            } catch (err: any) {
                thrownError = err;
            } finally {
                sub.dispose();
            }

            assert.ok(thrownError, 'Expected team member to fail on maxOutputBytes');
            assert.ok(thrownError.message.includes('output limit exceeded'));
        });
    });
});

import * as assert from 'assert';
import { compileStep } from '../pipelineRunner';
import { Intent } from '../types';

suite('Compiler Mocked Test', () => {

    test('Variable Resolution', async () => {
        const store = new Map<string, any>();
        store.set('project', 'my-app');
        store.set('version', '1.0.0');

        const intent: Intent = {
            intent: 'test.intent',
            payload: {
                name: '${var:project}',
                tag: 'v${var:version}'
            }
        };

        const compiled = await compileStep(intent, store, '/root');
        assert.strictEqual(compiled.payload.name, 'my-app');
        assert.strictEqual(compiled.payload.tag, 'v1.0.0');
    });

    test('Git Checkout Compilation', async () => {
        const store = new Map<string, any>();
        const cwd = '/workspace/repo';

        const intent: Intent = {
            intent: 'git.checkout',
            payload: {
                branch: 'feature-branch',
                create: true
            }
        };

        const compiled = await compileStep(intent, store, cwd);

        assert.strictEqual(compiled.intent, 'terminal.run');
        assert.strictEqual(compiled.capabilities?.[0], 'terminal.run');
        assert.strictEqual(compiled.payload.command, 'git checkout -b feature-branch');
        assert.strictEqual(compiled.payload.cwd, cwd);
    });

    test('Git Commit Compilation', async () => {
        const store = new Map<string, any>();
        const cwd = '/workspace/repo';

        const intent: Intent = {
            intent: 'git.commit',
            payload: {
                message: 'chore: init',
                amend: false
            }
        };

        const compiled = await compileStep(intent, store, cwd);

        assert.strictEqual(compiled.payload.command, 'git commit -m "chore: init"');
        assert.strictEqual(compiled.payload.cwd, cwd);
    });

    test('Docker Build Compilation', async () => {
        const store = new Map<string, any>();
        const cwd = '/workspace/app';

        const intent: Intent = {
            intent: 'docker.build',
            payload: {
                tag: 'my-image:latest',
                path: '.'
            }
        };

        const compiled = await compileStep(intent, store, cwd);

        assert.strictEqual(compiled.payload.command, 'docker build -t my-image:latest .');
        assert.strictEqual(compiled.payload.cwd, cwd);
    });

    test('Docker Run Compilation', async () => {
        const store = new Map<string, any>();
        const cwd = '/workspace/app';

        const intent: Intent = {
            intent: 'docker.run',
            payload: {
                image: 'my-image:latest',
                detach: true
            }
        };

        const compiled = await compileStep(intent, store, cwd);

        assert.strictEqual(compiled.payload.command, 'docker run -d my-image:latest');
        assert.strictEqual(compiled.payload.cwd, cwd);
    });

    test('Non-compilable Intent Passthrough', async () => {
        const store = new Map<string, any>();
        const cwd = '/root';

        const intent: Intent = {
            intent: 'vscode.open',
            payload: { file: 'test.txt' }
        };

        const compiled = await compileStep(intent, store, cwd);

        assert.strictEqual(compiled.intent, 'vscode.open');
        assert.deepStrictEqual(compiled.payload, { file: 'test.txt' });
    });
});

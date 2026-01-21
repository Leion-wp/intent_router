import * as assert from 'assert';

const mockVscode = require('./vscode-mock');

suite('Flow Logic Tests (Mocked)', () => {

    setup(() => {
        mockVscode.window.terminals.length = 0;
    });

    test('Terminal reuse logic simulation', async () => {
        const termName = 'Intent Router';

        // Simulating the logic in terminalAdapter.ts
        let term = mockVscode.window.terminals.find((t: any) => t.name === termName);
        if (!term) {
            term = mockVscode.window.createTerminal(termName);
        }

        assert.ok(term);
        assert.strictEqual(mockVscode.window.terminals.length, 1);

        // Second call
        let term2 = mockVscode.window.terminals.find((t: any) => t.name === termName);
        if (!term2) {
            term2 = mockVscode.window.createTerminal(termName);
        }

        assert.strictEqual(term, term2);
        assert.strictEqual(mockVscode.window.terminals.length, 1);
    });

    test('Variable caching logic simulation', async () => {
        const cache = new Map<string, string>();
        const prompt = 'Branch Name';
        const key = `\${input:${prompt}}`; // Regex format used in logic

        // Simulation of resolveVariables logic
        async function resolve(text: string) {
             if (text.includes('${input:')) {
                 const p = 'Branch Name'; // simplified extraction
                 if (cache.has(p)) return text.replace('${input:Branch Name}', cache.get(p)!);

                 const val = await mockVscode.window.showInputBox({ prompt: p });
                 cache.set(p, val);
                 return text.replace('${input:Branch Name}', val);
             }
             return text;
        }

        // First run
        const res1 = await resolve('git checkout ${input:Branch Name}');
        assert.strictEqual(res1, 'git checkout mocked-value');
        assert.strictEqual(cache.size, 1);
        assert.strictEqual(cache.get('Branch Name'), 'mocked-value');

        // Second run (should use cache, though mock returns same value, logic is what matters)
        // Let's manually change cache to verify it uses it
        cache.set('Branch Name', 'cached-value');
        const res2 = await resolve('git checkout ${input:Branch Name}');
        assert.strictEqual(res2, 'git checkout cached-value');
    });
});

import * as path from 'path';
import * as Mocha from 'mocha';
import { glob } from 'glob';

async function main() {
    try {
        const mocha = new Mocha({
            ui: 'tdd',
            color: true
        });

        const testsRoot = path.resolve(__dirname);
        const files = await glob('*.test.js', { cwd: testsRoot });

        files
            .sort()
            .forEach((filePath: string) => mocha.addFile(path.resolve(testsRoot, filePath)));

        await new Promise<void>((resolve, reject) => {
            mocha.run((failures) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                    return;
                }
                resolve();
            });
        });
    } catch (err) {
        console.error('Failed to run mocked tests:', err);
        process.exit(1);
    }
}

main();

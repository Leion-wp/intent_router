import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const testRunRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-router-vscode-test-'));
        const testWorkspacePath = path.join(testRunRoot, 'workspace');
        const userDataDir = path.join(testRunRoot, 'user-data');
        const extensionsDir = path.join(testRunRoot, 'extensions');

        fs.mkdirSync(testWorkspacePath, { recursive: true });
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.mkdirSync(extensionsDir, { recursive: true });

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspacePath,
                '--user-data-dir',
                userDataDir,
                '--extensions-dir',
                extensionsDir
            ]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();

import * as assert from 'assert';
import * as vscode from 'vscode';
import { resetRegistry } from '../../registry';
import { registerCapabilities } from '../../registry';
import { routeIntent } from '../../router';

suite('Reproduction Test Suite - Atomic Intent without Capabilities', () => {
    const workspaceTarget = vscode.ConfigurationTarget.Workspace;
    const globalTarget = vscode.ConfigurationTarget.Global;
    const updateConfigSafe = async (config: vscode.WorkspaceConfiguration, key: string, value: any) => {
        try {
            await config.update(key, value, workspaceTarget);
        } catch {
            await config.update(key, value, globalTarget);
        }
    };

    setup(async () => {
        const config = vscode.workspace.getConfiguration('intentRouter');
        await updateConfigSafe(config, 'mappings', []);
        await updateConfigSafe(config, 'profiles', []);
        await updateConfigSafe(config, 'activeProfile', '');
    });

    test('Should resolve capability when intent matches registered capability name but capabilities array is missing', async () => {
        resetRegistry();
        const fakeCommand = 'intentRouter.test.atomicRun';

        registerCapabilities({
            provider: 'test',
            capabilities: [
                {
                    capability: 'test.run',
                    command: fakeCommand
                }
            ]
        });

        const ok = await routeIntent({
            intent: 'test.run',
            payload: { foo: 'bar' },
            meta: { dryRun: true }
        });

        assert.strictEqual(ok, true, 'Route should resolve and execute in dryRun mode');
    });
});

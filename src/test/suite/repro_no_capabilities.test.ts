import * as assert from 'assert';
import * as vscode from 'vscode';
import { resetRegistry } from '../../registry';

suite('Reproduction Test Suite - Atomic Intent without Capabilities', () => {
    test('Should resolve capability when intent matches registered capability name but capabilities array is missing', async () => {
        resetRegistry();
        const received: any[] = [];
        const fakeCommand = 'intentRouter.test.atomicRun';

        // Register the command
        const disposable = vscode.commands.registerCommand(fakeCommand, (payload) => {
            received.push(payload);
        });

        try {
            // Register the capability
            await vscode.commands.executeCommand('intentRouter.registerCapabilities', {
                provider: 'test',
                capabilities: [
                    {
                        capability: 'test.run',
                        command: fakeCommand
                    }
                ]
            });

            // Execute route WITHOUT capabilities array
            // This simulates the behavior of Pipeline Builder V1
            await vscode.commands.executeCommand('intentRouter.route', {
                intent: 'test.run',
                // capabilities: undefined // Explicitly missing
                payload: { foo: 'bar' }
            });

            assert.strictEqual(received.length, 1, 'Command should have been executed once');
            assert.deepStrictEqual(received[0], { foo: 'bar' }, 'Payload should match');
        } finally {
            disposable.dispose();
        }
    });
});

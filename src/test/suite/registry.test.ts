import * as assert from 'assert';
import { listPublicCapabilities, registerCapabilities, resetRegistry, resolveCapabilities } from '../../registry';
import { Intent, UserMapping } from '../../types';

suite('Registry Unit Test Suite', () => {
    setup(() => {
        resetRegistry();
    });

    test('Registry - Resolve Capabilities Empty', () => {
        const result = resolveCapabilities({ intent: 'noop', capabilities: [] });
        assert.strictEqual(result.length, 0);
    });

    test('Registry - Resolve Single Capability', () => {
        const result = resolveCapabilities({ intent: 'http.get', capabilities: ['http.get'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, 'http.get');
        assert.strictEqual(result[0].source, 'fallback');
        assert.strictEqual(result[0].capabilityType, 'atomic');
    });

    test('Registry - Register Capabilities (Simple List)', () => {
        const count = registerCapabilities({
            provider: 'git',
            capabilities: ['git.push'],
            command: 'git.push'
        });
        assert.strictEqual(count, 1);
        const result = resolveCapabilities({ intent: 'deploy', capabilities: ['git.push'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, 'git.push');
        assert.strictEqual(result[0].provider, 'git');
        assert.strictEqual(result[0].source, 'registry');
        assert.strictEqual(result[0].capabilityType, 'atomic');
    });

    test('Registry - Register Capabilities (Object Entries)', () => {
        const count = registerCapabilities({
            provider: 'docker',
            capabilities: [
                { capability: 'docker.build', command: 'docker.build' }
            ]
        });
        assert.strictEqual(count, 1);
        const result = resolveCapabilities({ intent: 'build', capabilities: ['docker.build'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, 'docker.build');
        assert.strictEqual(result[0].provider, 'docker');
        assert.strictEqual(result[0].source, 'registry');
        assert.strictEqual(result[0].capabilityType, 'atomic');
    });

    test('Registry - User Mapping Overrides Provider', () => {
        registerCapabilities({
            provider: 'git',
            capabilities: ['git.push'],
            command: 'git.push'
        });
        const mappings: UserMapping[] = [
            { capability: 'git.push', command: 'git.pushForce', provider: 'git' }
        ];
        const result = resolveCapabilities({ intent: 'deploy', capabilities: ['git.push'], provider: 'git' }, mappings);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, 'git.pushForce');
        assert.strictEqual(result[0].source, 'user');
        assert.strictEqual(result[0].capabilityType, 'atomic');
    });

    test('Registry - Provider/Target Returned For Filtering', () => {
        registerCapabilities({
            provider: 'git',
            target: 'origin',
            capabilities: ['git.push'],
            command: 'git.push'
        });
        registerCapabilities({
            provider: 'git',
            target: 'backup',
            capabilities: ['git.push'],
            command: 'git.pushBackup'
        });

        const intent: Intent = {
            intent: 'deploy',
            capabilities: ['git.push'],
            provider: 'git',
            target: 'backup'
        };

        const result = resolveCapabilities(intent);
        assert.strictEqual(result.length, 2);
        const commands = result.map(entry => entry.command).sort();
        assert.deepStrictEqual(commands, ['git.push', 'git.pushBackup']);
    });

    test('Registry - Composite Capability Is Public Only', () => {
        registerCapabilities({
            provider: 'git',
            capabilities: [
                {
                    capability: 'git.publishPR',
                    command: 'git.publishPR',
                    capabilityType: 'composite',
                    steps: [
                        { capability: 'git.commit', command: 'git.commit' }
                    ]
                }
            ]
        });

        const publicCaps = listPublicCapabilities();
        assert.strictEqual(publicCaps.length, 1);
        assert.strictEqual(publicCaps[0].capability, 'git.publishPR');
        assert.strictEqual(publicCaps[0].capabilityType, 'composite');
    });
});

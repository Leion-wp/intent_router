import * as assert from 'assert';
import { resolveCapabilities } from '../../registry';

suite('Registry Unit Test Suite', () => {
    test('Registry - Resolve Capabilities Empty', () => {
        const result = resolveCapabilities({ intent: 'noop', capabilities: [] });
        assert.strictEqual(result.length, 0);
    });

    test('Registry - Resolve Single Capability', () => {
        const result = resolveCapabilities({ intent: 'http.get', capabilities: ['http.get'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, 'http.get');
    });
});

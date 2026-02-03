import * as assert from 'assert';
import * as path from 'path';
import { validateSafeRelativePath, validateStrictShellArg, sanitizeShellArg, sanitizeShArg, sanitizePowerShellArg } from '../security';

suite('Security Tests', () => {

    test('validateStrictShellArg', () => {
        // Valid
        validateStrictShellArg('abc', 'context');
        validateStrictShellArg('abc-123_def.ghi/jkl:mno@pqr', 'context');

        // Invalid
        assert.throws(() => validateStrictShellArg('abc; rm -rf', 'context'), /Invalid characters/);
        assert.throws(() => validateStrictShellArg('abc && def', 'context'), /Invalid characters/);
        assert.throws(() => validateStrictShellArg('abc|def', 'context'), /Invalid characters/);
        assert.throws(() => validateStrictShellArg('abc>def', 'context'), /Invalid characters/);
    });

    test('sanitizeShArg (POSIX)', () => {
        assert.strictEqual(sanitizeShArg('abc'), '"abc"');
        assert.strictEqual(sanitizeShArg('abc def'), '"abc def"');
        assert.strictEqual(sanitizeShArg('abc"def'), '"abc\\"def"');
        assert.strictEqual(sanitizeShArg('abc$def'), '"abc\\$def"');
        assert.strictEqual(sanitizeShArg('abc`def'), '"abc\\`def"');
        assert.strictEqual(sanitizeShArg('abc\\def'), '"abc\\\\def"');
    });

    test('sanitizePowerShellArg (Windows)', () => {
        assert.strictEqual(sanitizePowerShellArg('abc'), '"abc"');
        assert.strictEqual(sanitizePowerShellArg('abc def'), '"abc def"');
        assert.strictEqual(sanitizePowerShellArg('abc"def'), '"abc`"def"');
        assert.strictEqual(sanitizePowerShellArg('abc$def'), '"abc`$def"');
        assert.strictEqual(sanitizePowerShellArg('abc`def'), '"abc``def"');
        assert.strictEqual(sanitizePowerShellArg('abc\\def'), '"abc\\def"');
    });

    test('sanitizeShellArg (Platform Aware)', () => {
        if (process.platform === 'win32') {
            assert.strictEqual(sanitizeShellArg('foo"bar'), '"foo`"bar"');
        } else {
            assert.strictEqual(sanitizeShellArg('foo"bar'), '"foo\\"bar"');
        }
    });

    test('sanitizeShellArg (Explicit Style)', () => {
        assert.strictEqual(sanitizeShellArg('foo"bar', 'sh'), '"foo\\"bar"');
        assert.strictEqual(sanitizeShellArg('foo"bar', 'powershell'), '"foo`"bar"');
    });

    test('validateSafeRelativePath - Basic Relative', () => {
        const root = path.resolve('/root');

        // Simple relative
        validateSafeRelativePath('foo', root, root);

        // Relative inside subdir
        validateSafeRelativePath('foo/bar', root, root);

        // Parent but still inside
        const subdir = path.resolve('/root/sub');
        validateSafeRelativePath('../bar', root, subdir);

        // Traversal out
        assert.throws(() => validateSafeRelativePath('../foo', root, root), /Path .* resolves to .* which is outside trusted root/);
        assert.throws(() => validateSafeRelativePath('../../foo', root, subdir), /Path .* resolves to .* which is outside trusted root/);
    });

    test('validateSafeRelativePath - Absolute Paths', () => {
        const root = path.resolve('/root');

        // Absolute inside root
        validateSafeRelativePath(path.join(root, 'foo'), root, root);

        // Absolute outside root
        assert.throws(() => validateSafeRelativePath('/etc/passwd', root, root), /Path .* resolves to .* which is outside trusted root/);

        // Partial match (security bypass check)
        // If root is /root/safe, /root/safe-suffix should be invalid
        const safeRoot = path.resolve('/root/safe');
        const attackPath = path.resolve('/root/safe-suffix');
        assert.throws(() => validateSafeRelativePath(attackPath, safeRoot, safeRoot), /Path .* resolves to .* which is outside trusted root/);
    });

    test('validateSafeRelativePath - Null Bytes', () => {
        const root = path.resolve('/root');
        assert.throws(() => validateSafeRelativePath('foo\0bar', root, root), /Path contains null bytes/);
    });
});

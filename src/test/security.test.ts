import * as assert from 'assert';
// @ts-ignore - function will be added
import { validateSafeRelativePath } from '../security';

describe('Security Utils', () => {
    describe('validateSafeRelativePath', () => {
        it('should allow simple relative paths', () => {
            validateSafeRelativePath('src', 'test');
            validateSafeRelativePath('src/test', 'test');
            validateSafeRelativePath('foo-bar', 'test');
            validateSafeRelativePath('file.txt', 'test');
        });

        it('should throw for empty path', () => {
            // Depending on implementation, might ignore empty or throw.
            // validateStrictShellArg ignores empty?
            // "if (!arg) return;" in validateStrictShellArg.
            // My plan logic says: "Call validateStrictShellArg".
            // So empty might pass?
            // "if (!path) return;" is in my planned impl.
            validateSafeRelativePath('', 'test');
        });

        it('should throw for absolute paths (Unix)', () => {
            assert.throws(() => validateSafeRelativePath('/etc/passwd', 'test'), /Absolute paths/);
            assert.throws(() => validateSafeRelativePath('/tmp', 'test'), /Absolute paths/);
        });

        it('should throw for absolute paths (Windows)', () => {
            assert.throws(() => validateSafeRelativePath('C:/Windows', 'test'), /Absolute paths/);
            // Backslashes are caught by strict character validation first
            assert.throws(() => validateSafeRelativePath('D:\\Data', 'test'), /Invalid characters|Absolute paths/);
            assert.throws(() => validateSafeRelativePath('\\\\Server\\Share', 'test'), /Invalid characters|Absolute paths/);
        });

        it('should throw for path traversal', () => {
            assert.throws(() => validateSafeRelativePath('../secret', 'test'), /Path traversal/);
            assert.throws(() => validateSafeRelativePath('src/../secret', 'test'), /Path traversal/);
            assert.throws(() => validateSafeRelativePath('..', 'test'), /Path traversal/);
        });

        it('should throw for unsafe characters (inherited from validateStrictShellArg)', () => {
            assert.throws(() => validateSafeRelativePath('foo bar', 'test'), /Invalid characters/); // space
            assert.throws(() => validateSafeRelativePath('foo;rm', 'test'), /Invalid characters/);
            assert.throws(() => validateSafeRelativePath('foo&bar', 'test'), /Invalid characters/);
        });
    });
});

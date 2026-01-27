import * as assert from 'assert';
import { validateStrictShellArg, validateSafeRelativePath } from '../security';

describe('Security Utils', () => {
    describe('validateStrictShellArg', () => {
        it('should allow alphanumeric and safe chars', () => {
            validateStrictShellArg('abc-123_./:@', 'test');
        });

        it('should reject spaces', () => {
            assert.throws(() => validateStrictShellArg('foo bar', 'test'), /Invalid characters/);
        });

        it('should reject shell characters', () => {
            assert.throws(() => validateStrictShellArg('foo;bar', 'test'), /Invalid characters/);
            assert.throws(() => validateStrictShellArg('foo&bar', 'test'), /Invalid characters/);
            assert.throws(() => validateStrictShellArg('foo|bar', 'test'), /Invalid characters/);
        });
    });

    describe('validateSafeRelativePath', () => {
        it('should allow safe relative paths', () => {
            validateSafeRelativePath('.', 'test');
            validateSafeRelativePath('src', 'test');
            validateSafeRelativePath('./src/test', 'test');
            validateSafeRelativePath('foo-bar_baz', 'test');
        });

        it('should reject parent directory traversal', () => {
            assert.throws(() => validateSafeRelativePath('..', 'test'), /Path traversal/);
            assert.throws(() => validateSafeRelativePath('../src', 'test'), /Path traversal/);
            assert.throws(() => validateSafeRelativePath('src/../test', 'test'), /Path traversal/);
        });

        it('should reject absolute paths', () => {
            assert.throws(() => validateSafeRelativePath('/etc/passwd', 'test'), /Absolute paths/);
            assert.throws(() => validateSafeRelativePath('/usr/bin', 'test'), /Absolute paths/);
            assert.throws(() => validateSafeRelativePath('C:/Windows', 'test'), /Absolute paths/);
            assert.throws(() => validateSafeRelativePath('d:/data', 'test'), /Absolute paths/);
        });

        it('should reject paths with invalid characters', () => {
            assert.throws(() => validateSafeRelativePath('src/foo bar', 'test'), /Invalid characters/);
        });
    });
});

import * as assert from 'assert';
import { validateSafeRelativePath } from '../security';

describe('Security Utilities', () => {

    describe('validateSafeRelativePath', () => {
        it('should allow safe relative paths', () => {
            const safePaths = [
                '.',
                'src',
                'src/test',
                './src',
                'path/to/file.txt',
                'path-with-dashes/and_underscores'
            ];
            for (const path of safePaths) {
                assert.doesNotThrow(() => validateSafeRelativePath(path, 'test'), `Should accept ${path}`);
            }
        });

        it('should reject absolute paths (Unix) when no root provided', () => {
            const unsafePaths = [
                '/etc/passwd',
                '/usr/bin',
                '/',
                '/var'
            ];
            for (const path of unsafePaths) {
                assert.throws(() => validateSafeRelativePath(path, 'test'), /Absolute paths/, `Should reject ${path}`);
            }
        });

        it('should reject absolute paths (Windows) when no root provided', () => {
            const unsafePaths = [
                'C:\\Windows',
                'D:/Data',
                'c:\\',
                'F:file'
            ];
            for (const path of unsafePaths) {
                assert.throws(() => validateSafeRelativePath(path, 'test'), /Absolute paths/, `Should reject ${path}`);
            }
        });

        it('should reject path traversal sequences', () => {
            const unsafePaths = [
                '../parent',
                'src/../../etc',
                './../root',
                '..',
                'folder/..'
            ];
            for (const path of unsafePaths) {
                assert.throws(() => validateSafeRelativePath(path, 'test'), /Path traversal/, `Should reject ${path}`);
            }
        });

        it('should allow absolute paths if inside trusted root', () => {
            const root = '/app/workspace';
            assert.doesNotThrow(() => validateSafeRelativePath('/app/workspace/src', 'test', root));
            assert.doesNotThrow(() => validateSafeRelativePath('/app/workspace', 'test', root));
        });

        it('should reject absolute paths if NOT inside trusted root', () => {
            const root = '/app/workspace';
            assert.throws(() => validateSafeRelativePath('/etc/passwd', 'test', root), /Absolute paths/);
            assert.throws(() => validateSafeRelativePath('/app/other', 'test', root), /Absolute paths/);
        });

        it('should reject traversal even inside trusted root', () => {
            const root = '/app/workspace';
            // /app/workspace/../secret -> startsWith root! But contains ..
            assert.throws(() => validateSafeRelativePath('/app/workspace/../secret', 'test', root), /Path traversal/);
        });
    });
});

import * as assert from 'assert';
import { validateCwdString } from '../../security';

suite('Terminal Security Tests', () => {
    test('validateCwdString accepts valid paths', () => {
        validateCwdString('/home/user/project');
        validateCwdString('C:\\Users\\name\\Project');
        validateCwdString('./relative/path');
    });

    test('validateCwdString rejects double quotes', () => {
        assert.throws(() => validateCwdString('/path/with/"quote"'), /Security Error/);
    });

    test('validateCwdString accepts single quotes', () => {
        validateCwdString("/path/with/'quote'");
    });

    test('validateCwdString rejects newlines', () => {
        assert.throws(() => validateCwdString('/path/with/\nnewline'), /Security Error/);
    });

    test('validateCwdString rejects backticks', () => {
        assert.throws(() => validateCwdString('/path/with/`backtick`'), /Security Error/);
    });

    test('validateCwdString rejects dollar signs', () => {
        assert.throws(() => validateCwdString('/path/with/$var'), /Security Error/);
        assert.throws(() => validateCwdString('/path/with/$(cmd)'), /Security Error/);
    });
});

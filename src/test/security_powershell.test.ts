import * as assert from 'assert';
import { sanitizeShellArg } from '../security';

suite('Security PowerShell Tests', () => {
    test('sanitizeShellArg - PowerShell Style Escapes Correctly', () => {
        const input = 'foo" ; Calc';
        // " escapes to `", ` escapes to ``, $ escapes to `$
        // Wrapped in "..."
        // Expected: "foo`" ; Calc"
        const output = sanitizeShellArg(input, 'powershell');
        assert.strictEqual(output, '"foo`" ; Calc"');
    });

     test('sanitizeShellArg - PowerShell Style Escapes Backticks and Dollars', () => {
        const input = 'Price is $100 `approx`';
        // $ -> `$
        // ` -> ``
        // Expected: "Price is `$100 ``approx``"
        const output = sanitizeShellArg(input, 'powershell');
        assert.strictEqual(output, '"Price is `$100 ``approx``"');
    });

    test('sanitizeShellArg - SH Style (Default) Still Works', () => {
         const input = 'foo"bar';
         const output = sanitizeShellArg(input); // defaults to 'sh'
         assert.strictEqual(output, '"foo\\"bar"');
    });
});

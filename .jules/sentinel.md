## 2025-02-12 - Windows PowerShell Command Injection
**Vulnerability:** `sanitizeShellArg` used POSIX-style backslash escaping (`\"`) which PowerShell treats as a literal string ending in a backslash, allowing command injection via `foo" ; Calc ; "`.
**Learning:** VS Code extensions running on Windows default to PowerShell, which ignores backslash escapes for double quotes. `process.platform === 'win32'` checks are mandatory for shell generation.
**Prevention:** Use platform-aware sanitization. For PowerShell, use backtick escapes (` `" `) or other safe quoting mechanisms.

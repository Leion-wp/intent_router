# Sentinel's Journal

## 2024-05-22 - Windows Command Injection via Incorrect Escaping
**Vulnerability:** Command injection vulnerability on Windows systems where user input (e.g., git commit messages) was sanitized using Unix-style backslash escaping, which is ineffective in PowerShell (the default shell used by the application on Windows).
**Learning:** `sanitizeShellArg` was assuming a "one size fits all" approach (sh-style). PowerShell requires backtick (`) escaping for special characters.
**Prevention:** Always use platform-specific sanitization functions (`sanitizePowerShellArg` vs `sanitizeShArg`) when constructing shell commands, and explicitly detect the target shell/platform.

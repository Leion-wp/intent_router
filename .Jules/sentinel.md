## 2025-05-15 - PowerShell Command Injection via POSIX Sanitization
**Vulnerability:** The application used a single `sanitizeShellArg` function based on POSIX (sh/bash) rules (escaping `$` with `\`) for all platforms. On Windows, `child_process.spawn` (via `terminalAdapter.ts`) executes commands using PowerShell, where `\` is a literal character and does not escape `$`. This allowed command injection via payloads like `$(calc)`.
**Learning:** Cross-platform shell execution requires platform-specific sanitization. `child_process.spawn` options (like `shell: true` vs explicit `powershell.exe`) dictate the quoting rules.
**Prevention:** Use `process.platform` to select the appropriate sanitizer. For PowerShell, escape `"`, `$`, and `` ` `` using the backtick character (`` ` ``).

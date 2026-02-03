## 2025-05-20 - Platform-Aware Shell Sanitization
**Vulnerability:** PowerShell on Windows uses different escaping rules (backticks) than POSIX shells (backslashes). Using POSIX escaping on Windows can lead to command injection or syntax errors.
**Learning:** `process.platform === 'win32'` implies Windows, but not necessarily PowerShell (could be `cmd.exe`). However, `terminalAdapter` explicitly uses PowerShell for pipeline steps.
**Prevention:** `sanitizeShellArg` now accepts an explicit `style` argument ('sh' or 'powershell'). Callers must explicitly specify the style based on the target shell to avoid ambiguity, especially when `cmd.exe` might be involved (where PowerShell escaping is unsafe).

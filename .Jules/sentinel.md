## 2024-05-23 - Command Injection in Terminal Steps
**Vulnerability:** Variable substitution in `terminal.run` commands (`${var:...}` and `${input:...}`) was performed using direct string replacement without sanitization, allowing attackers to inject arbitrary shell commands via crafted variable values.
**Learning:** Generic variable substitution utilities (like `resolveVariables`) must be context-aware. If the context is a shell command, strict sanitization (escaping/quoting) is required. Validating inputs *before* substitution (as done in `git.*` intents) is safer than sanitizing *during* substitution, but for raw command intents (`terminal.run`), sanitization during substitution is the only defense.
**Prevention:**
1. Avoid "raw" shell command capabilities where possible; prefer structured intents (like `git.checkout`) with strict argument validation.
2. When raw shell access is necessary, enforce automatic sanitization of all dynamic inputs (variables) using secure escaping functions (like `sanitizeShellArg`).
3. Differentiate between "safe" (validating) and "unsafe" (raw) contexts when resolving variables.

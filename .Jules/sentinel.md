## 2024-05-22 - Missing Path Validation
**Vulnerability:** `validateSafeRelativePath` was referenced in documentation/memory but missing from codebase. `validateStrictShellArg` was used for paths but allowed traversal (`..`) and absolute paths (if starting with `/`).
**Learning:** Regex character validation (`^[a-zA-Z0-9\-_./:@]+$`) is insufficient for file paths as it permits traversal characters (`.`) and root indicators (`/`).
**Prevention:** Always verify security helper functions exist and test them with specific attack vectors (traversal, absolute paths) rather than assuming existence or correctness based on name.

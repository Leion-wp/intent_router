# Intent Router for Acode

## Description
Human-centric orchestration layer for mobile automation. This plugin allows Acode to communicate with various services (GitHub, Terminal, AI) through a unified Intent system.

## Installation
1. Navigate to the `acode-plugin` folder in your file manager.
2. Select the following files:
   - `main.js`
   - `plugin.json`
   - `README.md`
3. Compress them into a single **ZIP** archive.
4. Open Acode.
5. Go to **Settings** > **Plugins**.
6. Tap the **+** (plus) icon or the three dots menu and select **Install from file**.
7. Select your created ZIP archive.
8. Restart Acode.

## Usage
- Open the Command Palette (`Ctrl+Shift+P`).
- Search for **Intent Router**.
- Open **Intent Router: Show Pipelines** to view project pipelines in `.intent.json`.
- Tap **Dry Run** on any pipeline card to inspect the step-by-step plan without executing side effects.
- Search for **Intent Router: Dry Run Pipeline** in the command palette to dry-run a pipeline file.
- Developers can access the router via the global `intentRouter` object.

## Features
- **Dry-Run Planning Mode**: Inspect and validate pipeline execution plans (`meta.dryRun: true`) without side effects on files, terminal, or network.
- **Sensitive Field Redaction**: Automatically redacts sensitive fields (`token`, `authorization`, `apiKey`, `secret`, `password`, etc.) in plan outputs and logs.
- **System Routing**: Control Acode UI and files.
- **Terminal Integration**: Execute commands directly (requires Terminal plugin).
- **GitHub API**: Fetch repos and files.
- **File System (FS)**: Read, write, and manage local files via `fsOperation`.

## API Example
```javascript
// Send a toast notification
intentRouter.route({
  action: 'system:toast',
  data: { message: 'Hello World' }
});

// Dry-run a pipeline without executing side effects
intentRouter.route({
  action: 'pipeline:dry_run',
  data: {
    pipeline: {
      meta: { dryRun: true },
      steps: [
        { intent: 'file.read', payload: { path: '/tmp/input.txt' } },
        { intent: 'file.write', payload: { path: '/tmp/output.txt', content: 'test', token: 'secret_123' } }
      ]
    }
  }
});
```

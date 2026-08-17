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
- Available commands:
  - **Intent Router: Show Pipelines**: Browse and run project pipelines (`*.intent.json`).
  - **Intent Router: Run History**: View persistent execution history and step logs stored in `.intent-router/runs.json`.
  - **Intent Router: Run smoke test**: Run diagnostic checks.
  - **Intent Router: View logs**: View in-memory router logs.
  - **Intent Router: Show capabilities**: Check available plugin capabilities.
- Developers can access the router via the global `intentRouter` object.

## Features
- **Pipeline Execution & History**: Execute pipelines from project folders and automatically save structured execution summaries (status, duration, step count, failed step, step logs) in `.intent-router/runs.json` with bounded retention.
- **System Routing**: Control Acode UI and files.
- **Terminal Integration**: Execute commands directly (requires Terminal plugin).
- **GitHub API**: Fetch repos and files.
- **File System (FS)**: Read, write, and manage local files via `fsOperation`.
- **Extensible**: Register custom providers at runtime using `intentRouter.register()`.

## API Example
```javascript
// Retrieve persistent pipeline run history
const history = await intentRouter.route({ action: 'router:run_history' });

// Clear run history
await intentRouter.route({ action: 'router:clear_run_history' });

// Send a toast notification
intentRouter.route({
  action: 'system:toast',
  data: { message: 'Hello World' }
});

// List files in a directory
intentRouter.route({
  action: 'file:list',
  data: { path: 'file:///sdcard/Documents' }
});
```

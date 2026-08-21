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
- You can run tests or view logs.
- Developers can access the router via the global `intentRouter` object.

## Features
- **System Routing**: Control Acode UI and files.
- **Terminal Integration**: Execute commands directly (requires Terminal plugin).
- **GitHub API**: Fetch repos and files.
- **File System (FS)**: Read, write, and manage local files via `fsOperation`.
- **Event-Driven Triggers**: Automatically react to workspace file changes using `system.trigger.watch` steps in workspace pipelines.
- **Extensible**: Register custom providers at runtime using `intentRouter.registerProvider()`.

## Event-Driven Watch Triggers (`system.trigger.watch`)
Pipelines located in the `pipeline/` directory can declare file-watch triggers to automatically execute upon file events while Acode is active in the foreground.

### Example Step
```json
{
  "id": "watch_src",
  "intent": "system.trigger.watch",
  "payload": {
    "enabled": true,
    "glob": "src/**/*.js",
    "events": "create,change,delete",
    "debounceMs": 800,
    "cooldownMs": 2500,
    "pollIntervalMs": 3000
  }
}
```

### Configuration Parameters
- `glob` / `path`: Relative workspace pattern or path to watch. Unsafe external or parent paths outside the workspace are rejected.
- `events`: Comma-separated or array of events (`create`, `change`, `delete`). Default is `change`.
- `debounceMs`: Coalesce rapid consecutive saves (default: `800` ms).
- `cooldownMs`: Rate-limit trigger invocations (default: `2500` ms).
- `pollIntervalMs`: Foreground polling frequency (default: `3000` ms, bounded between 1000ms and 60000ms).
- `enabled`: Set to `false` to disable the trigger.

### Foreground Boundary Notice
> **Note**: File watching operates strictly in the **foreground** while Acode is running and active. No background Android service is used, and file watching is paused when Android suspends or kills Acode.

### Inspect Active Triggers
- Open Command Palette (`Ctrl+Shift+P`) and select **Intent Router: Show Active Triggers**.
- Alternatively, route action `router:triggers`.

## API Example
```javascript
// Send a toast notification
intentRouter.execute({
  scheme: 'system',
  action: 'toast',
  data: { message: 'Hello World' }
});

// List files in a directory
intentRouter.execute({
  scheme: 'fs',
  action: 'list',
  data: { path: 'file:///sdcard/Documents' }
});
```

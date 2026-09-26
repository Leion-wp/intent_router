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
- **Terminal Integration**:
  - `terminal:run` (`terminal.run`): Blocking command execution for one-shot pipeline steps using `globalThis.Executor.execute(...)`. Awaits process completion, returning `{ completed: true, stdout }`, or rejecting on error. Supports `{ command, cwd, alpine }`.
  - `terminal:exec` (`terminal.exec`): Interactive/fire-and-forget submission using `terminal.write(...)`. Returns `{ submitted: true }`.
- **GitHub API**: Fetch repos and files.
- **File System (FS)**: Read, write, and manage local files via `fsOperation`.
- **Extensible**: Register custom providers at runtime using `intentRouter.registerProvider()`.

## API Example
```javascript
// Send a toast notification
intentRouter.execute({
  scheme: 'system',
  action: 'toast',
  data: { message: 'Hello World' }
});

// Run a blocking shell command and await stdout
intentRouter.route({
  action: 'terminal:run',
  data: { command: 'npm install', cwd: '/sdcard/Projects/my-app' }
});

// Submit an interactive command to terminal session
intentRouter.route({
  action: 'terminal:exec',
  data: { command: 'ls -la' }
});

// List files in a directory
intentRouter.execute({
  scheme: 'fs',
  action: 'list',
  data: { path: 'file:///sdcard/Documents' }
});
```

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
- **Extensible**: Register custom providers at runtime using `intentRouter.registerProvider()`.
- **Pipeline Size Bounding**: Pipeline definitions (`.intent.json`) are checked before reading and parsing. By default, files exceeding `MAX_PIPELINE_BYTES` (5 MB / 5,242,880 bytes) are rejected with a `pipeline_too_large` error to protect mobile WebView memory.
- **Editor Open Bounding**: `editor:open_file` actions are bounded to protect mobile WebView memory. By default, files exceeding `DEFAULT_EDITOR_MAX_BYTES` (5 MB / 5,242,880 bytes) are rejected with an `editor_file_too_large` error before tab creation. Custom bounds can be specified via `maxBytes`.
- **Network Response Bounding**: `network:request` (and `github:request` / `github:fetch_repo`) accepts an optional `maxResponseBytes` parameter. Oversized responses are rejected via `Content-Length` headers or interrupted during streaming with a `response_too_large` error to prevent mobile WebView memory pressure.

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

// Read file with optional maxBytes limit
intentRouter.execute({
  scheme: 'file',
  action: 'read',
  data: { path: 'file:///sdcard/Documents/log.txt', maxBytes: 1048576 }
});

// Open file in editor with optional maxBytes limit (defaults to 5 MB)
intentRouter.execute({
  action: 'editor:open_file',
  data: { path: 'file:///sdcard/Documents/large_log.txt', maxBytes: 2097152 }
});

// Network request bounded by response size and timeout
intentRouter.route({
  action: 'network:request',
  data: {
    url: 'https://api.github.com/repos/owner/repo/releases',
    maxResponseBytes: 1048576, // 1 MB limit
    timeoutMs: 5000
  }
});
```

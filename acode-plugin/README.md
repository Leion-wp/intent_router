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
- **Step Retry Policies**: Steps can specify bounded retry policies (`mode: "none" | "fixed" | "exponential"`) with `maxAttempts` (1–10), `delayMs`, `maxDelayMs`, and `jitterMs` to automatically recover from transient network or execution failures.

## Step Retry Policies
Mobile pipeline steps can declare portable retry policies directly on `step.retry` or `step.payload.retry`:

```json
{
  "intent": "network.request",
  "payload": {
    "url": "https://api.example.com/data"
  },
  "retry": {
    "mode": "exponential",
    "maxAttempts": 3,
    "delayMs": 1000,
    "maxDelayMs": 10000,
    "jitterMs": 250
  }
}
```

- **`mode`**: `'none'`, `'fixed'`, or `'exponential'`. (Default: `'none'`)
- **`maxAttempts`**: Maximum attempt count (bounded between 1 and 10).
- **`delayMs`**: Initial delay in milliseconds between attempts (default: 1000 ms).
- **`maxDelayMs`**: Upper bound for exponential backoff delay (default: 30000 ms).
- **`jitterMs`**: Random jitter in milliseconds added to backoff delays to reduce thundering herd issues (default: 0 ms).

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
```

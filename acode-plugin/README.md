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

## API Example
```javascript
// Send a toast notification
intentRouter.route({
  action: 'system:toast',
  data: { message: 'Hello World' }
});

// Network request with optional timeoutMs guard
intentRouter.route({
  action: 'network:request',
  data: {
    url: 'https://api.example.com/data',
    method: 'GET',
    timeoutMs: 5000
  }
});

// GitHub API request with timeoutMs guard
intentRouter.route({
  action: 'github:request',
  data: {
    path: '/user',
    token: 'ghp_xxx',
    timeoutMs: 10000
  }
});
```

### Network Timeout & Cancellation
`network:request` and `github:request` support an optional `timeoutMs` parameter (positive finite number in milliseconds). When supplied, `AbortController` is used to cancel the request if it does not complete within the specified deadline, returning a structured timeout error (`Request timed out after <timeoutMs>ms`).

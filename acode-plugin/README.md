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
- **Pipeline Run Queue**: Serialized FIFO pipeline execution runtime (`maxConcurrentRuns = 1`, bounded queue length = 20) preventing resource collisions on mobile.
- **Extensible**: Register custom providers at runtime using `intentRouter.registerProvider()`.

## Run Queue API
All pipeline executions pass through `intentRouter.runQueue` to ensure deterministic execution order on mobile.

```javascript
// Enqueue a pipeline from a file or data
intentRouter.runQueue.enqueue({
  fileUrl: 'file:///sdcard/project/pipeline/test.intent.json',
  source: 'manual', // or 'cron', 'agent', etc.
  onProgress: (progress) => {
    console.log(progress.status, progress.step, progress.total);
  }
}).then(result => {
  console.log('Pipeline finished', result);
}).catch(err => {
  console.error('Pipeline failed or queue rejected', err);
});

// Inspect the queue via router action
const status = await intentRouter.route({ action: 'router:run_queue' });
console.log(status.data);
/*
{
  state: 'running', // 'idle' | 'queued' | 'running'
  maxConcurrentRuns: 1,
  maxQueueLength: 20,
  activeCount: 1,
  queuedCount: 1,
  active: [ { id: 'run_...', source: 'manual', pipelineName: 'test.intent.json', startedAt: '...', status: 'running' } ],
  pending: [ { id: 'run_...', position: 1, source: 'cron', pipelineName: 'sync.intent.json', queuedAt: '...', status: 'queued' } ]
}
*/
```

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

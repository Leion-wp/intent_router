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
- **OpenAI-Compatible AI Bridge**: Execute AI completion tasks via `ai:chat` / `ai.chat` intent across registered local/LAN or remote OpenAI-style endpoints without hardcoding secrets in pipelines.
- **Extensible**: Register custom providers and runtime AI provider profiles using `intentRouter.registerAiProvider()`.
- **Pipeline Size Bounding**: Pipeline definitions (`.intent.json`) are checked before reading and parsing. By default, files exceeding `MAX_PIPELINE_BYTES` (5 MB / 5,242,880 bytes) are rejected with a `pipeline_too_large` error to protect mobile WebView memory.
- **Editor Open Bounding**: `editor:open_file` actions are bounded to protect mobile WebView memory. By default, files exceeding `DEFAULT_EDITOR_MAX_BYTES` (5 MB / 5,242,880 bytes) are rejected with an `editor_file_too_large` error before tab creation. Custom bounds can be specified via `maxBytes`.
- **System URL Scheme Validation**: `system:open_url` strictly enforces web capability safety by permitting only explicit `https:` and `http:` URL schemes (case-insensitive). Non-HTTP(S) schemes (such as `javascript:`, `data:`, `file:`, `content:`, `intent:`, `tel:`, `sms:`, or custom deep link schemes) and relative URLs are rejected prior to calling `window.open` with a structured `url_scheme_not_allowed` error.

## AI Bridge Setup & API Example
```javascript
// Register an OpenAI-compatible runtime AI profile (secrets stay in memory)
intentRouter.registerAiProvider('openrouter', {
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'meta-llama/llama-3-70b-instruct',
  token: 'sk-or-v1-secret'
});

// Or a local/LAN AI endpoint (e.g., Ollama or LM Studio)
intentRouter.registerAiProvider('local-llm', {
  baseUrl: 'http://192.168.1.50:11434/v1',
  model: 'llama3'
});

// List registered AI providers (non-sensitive metadata only)
intentRouter.execute({ action: 'router:ai_providers' });

// Invoke ai:chat intent from JS or mobile pipeline
intentRouter.execute({
  action: 'ai:chat',
  data: {
    provider: 'openrouter',
    messages: [
      { role: 'system', content: 'You are a code reviewer.' },
      { role: 'user', content: 'Review function foo() in main.js' }
    ],
    temperature: 0.2
  }
});
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

// Open external web URL (HTTP / HTTPS allowed)
intentRouter.execute({
  action: 'system:open_url',
  data: { url: 'https://example.com' }
});
```

## Testing & CI
Run the canonical Acode regression test suite locally from the root directory:
```bash
npm run test:acode
```
This regression harness runs automatically in GitHub Actions (`acode-regression`) on pull requests to `Android` modifying `acode-plugin/` or test infrastructure.

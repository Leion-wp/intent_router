# Intent Router (VS Code Extension)

Centralized intent routing for VS Code and agentic workflows. The extension exposes a single entry point, resolves capabilities, and dispatches to VS Code commands registered by other extensions.

## Features
- One command to route intents: `intentRouter.route`
- Dynamic capability registration via `intentRouter.registerCapabilities`
- User mappings and profile overrides
- Dry-run mode
- Output channel logs with trace IDs
- External provider stub (logs error, no transport yet)

## Quick Start (Dev Host)
1) Open this repo in VS Code.
2) Press `F5` to launch the Extension Development Host.
3) In the host window, run: **Intent Router: Route Intent (JSON)**.
4) Paste:
```json
{"intent":"open commands","capabilities":["demo.showCommands"],"payload":{}}
```

To make the demo capability resolve, add this to your settings (host window):
```json
"intentRouter.mappings": [
  { "capability": "demo.showCommands", "command": "workbench.action.showCommands" }
]
```

Optional: enable the built-in demo Git provider in settings:
```json
"intentRouter.demoProvider": "git"
```

## Pipelines (.intent.json)
Create a pipeline file from the command palette:
- **Intent Router: Create Pipeline**

Run the current pipeline (active editor):
- **Intent Router: Run Pipeline**
- **Intent Router: Dry Run Pipeline**

Pipeline format (V1, linear):
```json
{
  "name": "deploy-app",
  "profile": "work",
  "steps": [
    {
      "intent": "build image",
      "capabilities": ["docker.build"],
      "payload": { "project": "demo" }
    },
    {
      "intent": "push code",
      "capabilities": ["git.push"],
      "payload": { "message": "deploy" }
    }
  ]
}
```

Rules:
- Steps execute in order.
- If a step fails, the pipeline stops.
- `Dry Run` injects `meta.dryRun=true` for all steps.

## Intent Format
```ts
type Intent = {
  intent: string
  capabilities?: string[]
  payload?: any
  provider?: string
  target?: string
  meta?: {
    dryRun?: boolean
    traceId?: string
    debug?: boolean
  }
}
```

## Register Capabilities (Handshake)
Other extensions register capabilities by calling:
```ts
await vscode.commands.executeCommand(
  "intentRouter.registerCapabilities",
  {
    provider: "git",
    capabilities: [
      { capability: "git.push", command: "git.push" },
      { capability: "git.commit", command: "git.commit", mapPayload: (intent) => ({ message: intent.payload?.message }) }
    ]
  }
);
```

## User Mappings
Settings key: `intentRouter.mappings`
```json
"intentRouter.mappings": [
  { "capability": "git.push", "command": "git.pushWithForce", "provider": "git" }
]
```

## Profiles (V2.3)
Settings keys: `intentRouter.activeProfile`, `intentRouter.profiles`
```json
"intentRouter.activeProfile": "work",
"intentRouter.profiles": [
  {
    "name": "work",
    "mappings": [
      { "capability": "git.push", "command": "git.push" }
    ],
    "enabledProviders": ["git", "docker"],
    "disabledProviders": ["legacy"]
  }
]
```

Resolution order:
1) Profile mappings
2) Global mappings
3) Registered capabilities
4) Fallback to `capability -> command`

## Observability
Output channel: **Intent Router**
Settings: `intentRouter.logLevel` (`error|warn|info|debug`)

Dry run:
```json
{
  "intent": "deploy app",
  "capabilities": ["git.push"],
  "meta": { "dryRun": true }
}
```

## Commands
- `Intent Router: Route Intent`
- `Intent Router: Route Intent (JSON)`

## Testing
```bash
npm test
```

## Notes
- External providers are stubbed and will log "not implemented".
- The route entry point is the only public action; everything else is internal plumbing.

# Leion Roots (VS Code Extension)

**The Human‑Centric Orchestration Cockpit for VS Code.**

Leion Roots is a low‑level orchestration layer designed to manage workflows between humans and AI agents with absolute transparency. It prioritizes **Human Sovereignty** over AI autonomy.

## Philosophy

> **“No Magic. No Opaque Autonomy. Strict Human Validation.”**

Leion Roots is designed to support a clear “Review & Merge” workflow where AI agents (like Codex or Jules) are producers/reviewers, but **never decision‑makers**.

- **Orchestration + Traceability:** Every action is visible, logged, and reproducible.
- **Terminal as Bedrock:** The primary interface is the `Terminal` provider. It is deterministic and visible.
- **Agents are Tools:** Intentions are proposed; destructive actions require explicit human confirmation.

If Leion Roots becomes magical, opaque, or autonomous, the project has failed.

## Key Features

### 1. Visual Pipeline Builder (The Cockpit)
Construct workflows visually using a drag‑and‑drop interface.

- **Drag & Drop:** Pull providers (Terminal, Git, System) from the sidebar.
- **Inline Configuration:** Edit commands and arguments directly in the graph.
- **Live Status:** Watch steps execute in real time with Running/Success/Failure indicators.
- **Launch:** Open via the **Leion Roots** view in the Activity Bar.

### 2. Core Providers
Leion Roots comes with strict, low‑level providers:

- **Terminal:** The neutral base. Reuses a single “Intent Router” terminal instance to keep history visible.
  - Capability: `terminal.run`
- **System:** Control flow and safety.
  - Capability: `system.pause` (Triggers a modal dialog for mandatory human review).
- **Git:** Wrapper around VS Code’s built‑in Git extension.
  - Capabilities: `git.checkout`, `git.commit`, `git.push`, `git.pull`.
- **Docker:** Wrapper around VS Code’s Docker extension.
  - Capabilities: `docker.build`, `docker.run`.

### 3. Workflow Logic
- **Variables (`${input:Prompt}`):** Ask the human for input at runtime (e.g., “Which branch?”). Values are cached per session.
- **Pause (`system.pause`):** Stop execution and wait for user confirmation.
- **Linear Execution:** Steps run sequentially. If one fails, the pipeline stops.

## Target Workflow (V1)

1. **Detection:** Select the latest PR branch.
2. **Checkout:** `terminal.run` checks out the branch.
3. **AI Review:** An AI agent reads code, tests, and fixes locally.
4. **Human Validation:** `system.pause` halts the pipeline for review.
5. **Merge:** You manually merge if satisfied.
6. **Loop:** The pipeline continues to the next PR.

Rules:
- No agent merges code automatically.
- All Git actions are visible in the Terminal.

## Usage

### Creating a Pipeline
1. Open the **Leion Roots** view in the Activity Bar.
2. Click **+ (New Pipeline)**.
3. Drag nodes (e.g., Terminal) onto the canvas.
4. Configure steps:
   - Terminal: `echo "Checking out..." && git checkout -b feature/demo`
   - System: Pause with message “Check the code now!”
5. Click **Save Pipeline**. It is saved as `pipeline/<name>.intent.json`.

### Running a Pipeline
- **From the Builder:** Click **Run** or use the Command Palette.
- **From the Tree View:** Right‑click a pipeline in **Intent Pipelines** and select **Run**.
- **Dry Run:** Simulates execution without side effects (where supported).

### JSON Format
Pipelines are stored as simple JSON files:
```json
{
  "name": "review-flow",
  "steps": [
    {
      "intent": "terminal.run",
      "description": "Checkout Branch",
      "payload": {
        "command": "git checkout ${input:BranchName}"
      }
    },
    {
      "intent": "system.pause",
      "description": "Human Review",
      "payload": {
        "message": "Review the code. Continue if safe."
      }
    }
  ]
}
```

## Architecture

- **Intent:** An abstract definition of “what needs to be done.”
- **Router:** Resolves intents to specific capabilities based on installed extensions.
- **Providers:** Adapters that map intents to VS Code APIs or external tools.
- **Pipeline Runner:** Executes a linear sequence of intents, handling state and events.

## Contributing

1. Clone the repository.
2. `npm install`
3. `npm run compile`
4. `F5` to launch the Extension Development Host.

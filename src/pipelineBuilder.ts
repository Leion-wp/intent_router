import * as vscode from 'vscode';
import { listPublicCapabilities } from './registry';
import { PipelineFile, ensurePipelineFolder, writePipelineToUri } from './pipelineRunner';

type CommandGroup = {
    provider: string;
    commands: string[];
};

export class PipelineBuilder {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;

    async open(pipeline?: PipelineFile, uri?: vscode.Uri): Promise<void> {
        this.currentUri = uri;
        const panel = vscode.window.createWebviewPanel(
            'intentRouter.pipelineBuilder',
            this.getTitle(pipeline, uri),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel = panel;
        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = undefined;
            }
        });

        const commandGroups = await this.getCommandGroups();
        const profileNames = this.getProfileNames();
        const initialPipeline = pipeline ?? { name: '', steps: [] };

        panel.webview.html = this.getHtml(panel.webview, {
            pipeline: initialPipeline,
            commandGroups,
            profiles: profileNames
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === 'save') {
                await this.savePipeline(message.data as PipelineFile);
                return;
            }
            if (message?.type === 'saveRun') {
                const saved = await this.savePipeline(message.data as PipelineFile);
                if (saved) {
                    await vscode.commands.executeCommand('intentRouter.runPipelineFromData', message.data, false);
                }
                return;
            }
            if (message?.type === 'saveDryRun') {
                const saved = await this.savePipeline(message.data as PipelineFile);
                if (saved) {
                    await vscode.commands.executeCommand('intentRouter.runPipelineFromData', message.data, true);
                }
                return;
            }
            if (message?.type === 'generatePrompt') {
                await vscode.commands.executeCommand('intentRouter.generatePromptAndOpenCodex');
                return;
            }
            if (message?.type === 'importClipboard') {
                await vscode.commands.executeCommand('intentRouter.importPipelineFromClipboardAndRun');
                return;
            }
            if (message?.type === 'openCodex') {
                await vscode.commands.executeCommand('intentRouter.openCodex');
                return;
            }
            if (message?.type === 'run') {
                await vscode.commands.executeCommand('intentRouter.runPipelineFromData', message.data, false);
                return;
            }
            if (message?.type === 'dryRun') {
                await vscode.commands.executeCommand('intentRouter.runPipelineFromData', message.data, true);
                return;
            }
            if (message?.type === 'openJson') {
                await this.openJson();
                return;
            }
        });
    }

    private getTitle(pipeline?: PipelineFile, uri?: vscode.Uri): string {
        if (pipeline?.name) {
            return `Pipeline Builder: ${pipeline.name}`;
        }
        if (uri) {
            return `Pipeline Builder: ${this.baseName(uri)}`;
        }
        return 'Pipeline Builder';
    }

    private baseName(uri: vscode.Uri): string {
        const parts = uri.path.split('/');
        return parts[parts.length - 1] || 'pipeline';
    }

    private async openJson(): Promise<void> {
        if (!this.currentUri) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument(this.currentUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    private async savePipeline(pipeline: PipelineFile): Promise<boolean> {
        if (!pipeline.name) {
            vscode.window.showErrorMessage('Pipeline name is required.');
            return false;
        }

        let targetUri = this.currentUri;
        if (!targetUri) {
            const folder = await ensurePipelineFolder();
            if (!folder) {
                vscode.window.showErrorMessage('Open a workspace folder to save a pipeline.');
                return false;
            }
            const fileName = pipeline.name.endsWith('.intent.json')
                ? pipeline.name
                : `${pipeline.name}.intent.json`;
            targetUri = vscode.Uri.joinPath(folder, fileName);
            this.currentUri = targetUri;
        }

        await writePipelineToUri(targetUri, pipeline);
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        if (this.panel) {
            this.panel.title = this.getTitle(pipeline, targetUri);
        }
        return true;
    }

    private async getCommandGroups(): Promise<CommandGroup[]> {
        const capabilities = listPublicCapabilities();
        const groups = new Map<string, Set<string>>();
        for (const entry of capabilities) {
            const provider = entry.provider || 'custom';
            if (!groups.has(provider)) {
                groups.set(provider, new Set());
            }
            groups.get(provider)?.add(entry.capability);
        }

        return Array.from(groups.entries())
            .map(([provider, cmds]) => ({
                provider,
                commands: Array.from(cmds).sort()
            }))
            .sort((a, b) => a.provider.localeCompare(b.provider));
    }

    private getProfileNames(): string[] {
        const profiles = vscode.workspace.getConfiguration('intentRouter').get<any[]>('profiles', []);
        if (!Array.isArray(profiles)) {
            return [];
        }
        return profiles.map(profile => profile?.name).filter((value: any) => typeof value === 'string');
    }

    private getHtml(webview: vscode.Webview, data: { pipeline: PipelineFile; commandGroups: CommandGroup[]; profiles: string[] }): string {
        const nonce = this.getNonce();
        const payload = JSON.stringify(data);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Builder</title>
    <style>
        body { font-family: Segoe UI, sans-serif; margin: 0; padding: 16px; }
        header { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
        input, select, textarea, button { font-family: inherit; font-size: 13px; }
        input[type="text"] { padding: 6px 8px; }
        select { padding: 6px 8px; }
        textarea { width: 100%; min-height: 80px; padding: 6px 8px; font-family: Consolas, monospace; }
        textarea.valid { border: 1px solid #2e7d32; }
        textarea.invalid { border: 1px solid #c62828; }
        .steps { display: flex; flex-direction: column; gap: 16px; }
        .step { border: 1px solid #2d2d2d; padding: 12px; border-radius: 6px; }
        .row { display: flex; gap: 12px; margin-bottom: 8px; }
        .row label { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .actions { display: flex; gap: 8px; margin-top: 16px; }
        .step-title { font-weight: 600; margin-bottom: 8px; }
        .muted { color: #888; font-size: 12px; }
        .top-actions { display: flex; gap: 8px; margin-left: auto; }
    </style>
</head>
<body>
    <header>
        <label>
            <div class="muted">Pipeline name</div>
            <input id="pipeline-name" type="text" />
        </label>
        <label>
            <div class="muted">Profile</div>
            <select id="pipeline-profile"></select>
        </label>
        <div class="top-actions">
            <button id="open-json">Open JSON</button>
            <button id="generate-prompt">Generate & Open Codex</button>
            <button id="import-clipboard">Import & Run</button>
        </div>
    </header>

    <div class="steps" id="steps"></div>

    <div class="actions">
        <button id="add-step">+ Add step</button>
        <button id="save">Save</button>
        <button id="save-run">Save & Run</button>
        <button id="save-dry-run">Save & Dry Run</button>
        <button id="run">Run</button>
        <button id="dry-run">Dry Run</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const data = ${payload};
        const commandGroups = data.commandGroups || [];
        const profiles = data.profiles || [];
        let steps = Array.isArray(data.pipeline.steps) ? data.pipeline.steps.map(stepToModel) : [];

        const nameInput = document.getElementById('pipeline-name');
        const profileSelect = document.getElementById('pipeline-profile');
        nameInput.value = data.pipeline.name || '';

        profileSelect.innerHTML = '';
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        profileSelect.appendChild(noneOption);
        profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile;
            option.textContent = profile;
            profileSelect.appendChild(option);
        });
        profileSelect.value = data.pipeline.profile || '';

        document.getElementById('add-step').addEventListener('click', () => {
            steps.push(createEmptyStep());
            render();
        });
        document.getElementById('save').addEventListener('click', () => send('save'));
        document.getElementById('save-run').addEventListener('click', () => send('saveRun'));
        document.getElementById('save-dry-run').addEventListener('click', () => send('saveDryRun'));
        document.getElementById('run').addEventListener('click', () => send('run'));
        document.getElementById('dry-run').addEventListener('click', () => send('dryRun'));
        document.getElementById('open-json').addEventListener('click', () => send('openJson'));
        document.getElementById('generate-prompt').addEventListener('click', () => send('generatePrompt'));
        document.getElementById('import-clipboard').addEventListener('click', () => send('importClipboard'));

        function createEmptyStep() {
            const firstProvider = commandGroups[0]?.provider || '';
            const firstCommand = commandGroups[0]?.commands?.[0] || '';
            return {
                provider: firstProvider,
                command: firstCommand,
                intent: '',
                payload: '',
                filter: ''
            };
        }

        function stepToModel(step) {
            const command = Array.isArray(step.capabilities) ? step.capabilities[0] : '';
            const provider = getProviderFromCommand(command);
            return {
                provider: provider || 'custom',
                command: command || '',
                intent: step.intent || '',
                payload: step.payload ? JSON.stringify(step.payload, null, 2) : '',
                filter: ''
            };
        }

        function getProviderFromCommand(command) {
            if (!command) return '';
            const idx = command.indexOf('.');
            if (idx === -1) return '';
            return command.slice(0, idx);
        }

        function render() {
            const container = document.getElementById('steps');
            container.innerHTML = '';

            steps.forEach((step, index) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'step';
                stepEl.innerHTML = \`
                    <div class="step-title">Step \${index + 1}</div>
                    <div class="row">
                        <label>
                            <div class="muted">Provider</div>
                            <select data-role="provider"></select>
                        </label>
                        <label>
                            <div class="muted">Action</div>
                            <input data-role="command-filter" type="text" placeholder="Filter commands" />
                            <select data-role="command"></select>
                        </label>
                    </div>
                    <div class="row">
                        <label>
                            <div class="muted">Intent</div>
                            <input data-role="intent" type="text" />
                        </label>
                    </div>
                    <div class="row">
                        <label style="flex:1;">
                            <div class="muted">Payload (JSON)</div>
                            <textarea data-role="payload"></textarea>
                            <div class="muted" data-role="payload-status"></div>
                        </label>
                    </div>
                    <button data-role="remove">Remove step</button>
                \`;

                const providerSelect = stepEl.querySelector('[data-role="provider"]');
                const commandSelect = stepEl.querySelector('[data-role="command"]');
                const commandFilter = stepEl.querySelector('[data-role="command-filter"]');
                const intentInput = stepEl.querySelector('[data-role="intent"]');
                const payloadInput = stepEl.querySelector('[data-role="payload"]');
                const payloadStatus = stepEl.querySelector('[data-role="payload-status"]');
                const removeButton = stepEl.querySelector('[data-role="remove"]');

                commandGroups.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.provider;
                    option.textContent = group.provider;
                    providerSelect.appendChild(option);
                });
                if (!providerSelect.value && commandGroups.length === 0) {
                    providerSelect.innerHTML = '<option value="">(none)</option>';
                }

                providerSelect.value = step.provider;
                commandFilter.value = step.filter || '';
                fillCommands(commandSelect, step.provider, step.command, step.filter);
                intentInput.value = step.intent || '';
                payloadInput.value = step.payload || '';
                updatePayloadValidation(payloadInput, payloadStatus, step.payload);

                providerSelect.addEventListener('change', (e) => {
                    step.provider = e.target.value;
                    step.filter = '';
                    commandFilter.value = '';
                    fillCommands(commandSelect, step.provider, '');
                    step.command = commandSelect.value;
                });
                commandFilter.addEventListener('input', (e) => {
                    step.filter = e.target.value;
                    fillCommands(commandSelect, step.provider, step.command, step.filter);
                });
                commandSelect.addEventListener('change', (e) => {
                    step.command = e.target.value;
                });
                intentInput.addEventListener('input', (e) => {
                    step.intent = e.target.value;
                });
                payloadInput.addEventListener('input', (e) => {
                    step.payload = e.target.value;
                    updatePayloadValidation(payloadInput, payloadStatus, step.payload);
                });
                removeButton.addEventListener('click', () => {
                    steps.splice(index, 1);
                    render();
                });

                container.appendChild(stepEl);
            });
        }

        function fillCommands(select, provider, current, filter) {
            select.innerHTML = '';
            const group = commandGroups.find(g => g.provider === provider);
            let commands = group ? group.commands : [];
            if (filter && filter.trim().length > 0) {
                const lower = filter.toLowerCase();
                commands = commands.filter(cmd => cmd.toLowerCase().includes(lower));
            }
            commands.forEach(cmd => {
                const option = document.createElement('option');
                option.value = cmd;
                option.textContent = cmd;
                select.appendChild(option);
            });
            if (commands.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '(none)';
                select.appendChild(option);
            }
            if (current && commands.includes(current)) {
                select.value = current;
            }
        }

        function updatePayloadValidation(textarea, status, value) {
            const trimmed = value ? value.trim() : '';
            textarea.classList.remove('valid', 'invalid');
            status.textContent = '';
            if (!trimmed) {
                return;
            }
            try {
                JSON.parse(trimmed);
                textarea.classList.add('valid');
                status.textContent = 'JSON valide';
            } catch (e) {
                textarea.classList.add('invalid');
                status.textContent = 'JSON invalide';
            }
        }

        function send(type) {
            const payload = buildPipelinePayload();
            if (!payload) return;
            vscode.postMessage({ type, data: payload });
        }

        function buildPipelinePayload() {
            const name = nameInput.value.trim();
            const profile = profileSelect.value || undefined;
            const stepsPayload = [];

            for (const step of steps) {
                if (!step.command) {
                    alert('Each step must have a command.');
                    return null;
                }
                let payload = undefined;
                if (step.payload && step.payload.trim().length > 0) {
                    try {
                        payload = JSON.parse(step.payload);
                    } catch (e) {
                        alert('Invalid JSON payload in a step.');
                        return null;
                    }
                }
                stepsPayload.push({
                    intent: step.intent || step.command,
                    capabilities: [step.command],
                    payload
                });
            }

            const pipeline = {
                name,
                steps: stepsPayload
            };
            if (profile) {
                pipeline.profile = profile;
            }
            return pipeline;
        }

        render();
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

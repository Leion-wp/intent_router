import * as vscode from 'vscode';
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
            if (message?.type === 'run') {
                await vscode.commands.executeCommand('intentRouter.runPipeline');
                return;
            }
            if (message?.type === 'dryRun') {
                await vscode.commands.executeCommand('intentRouter.dryRunPipeline');
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

    private async savePipeline(pipeline: PipelineFile): Promise<void> {
        if (!pipeline.name) {
            vscode.window.showErrorMessage('Pipeline name is required.');
            return;
        }

        let targetUri = this.currentUri;
        if (!targetUri) {
            const folder = await ensurePipelineFolder();
            if (!folder) {
                vscode.window.showErrorMessage('Open a workspace folder to save a pipeline.');
                return;
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
    }

    private async getCommandGroups(): Promise<CommandGroup[]> {
        const commands = await vscode.commands.getCommands(true);
        const groups = new Map<string, Set<string>>();
        const custom = new Set<string>();

        for (const cmd of commands) {
            const provider = this.getProviderFromCommand(cmd);
            if (!provider) {
                custom.add(cmd);
                continue;
            }
            if (!groups.has(provider)) {
                groups.set(provider, new Set());
            }
            groups.get(provider)?.add(cmd);
        }

        if (custom.size > 0) {
            groups.set('custom', custom);
        }

        return Array.from(groups.entries())
            .map(([provider, cmds]) => ({
                provider,
                commands: Array.from(cmds).sort()
            }))
            .sort((a, b) => a.provider.localeCompare(b.provider));
    }

    private getProviderFromCommand(command: string): string | undefined {
        const parts = command.split('.');
        if (parts.length < 2) {
            return undefined;
        }
        return parts[0];
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
        </div>
    </header>

    <div class="steps" id="steps"></div>

    <div class="actions">
        <button id="add-step">+ Add step</button>
        <button id="save">Save</button>
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
        document.getElementById('run').addEventListener('click', () => send('run'));
        document.getElementById('dry-run').addEventListener('click', () => send('dryRun'));
        document.getElementById('open-json').addEventListener('click', () => send('openJson'));

        function createEmptyStep() {
            const firstProvider = commandGroups[0]?.provider || '';
            const firstCommand = commandGroups[0]?.commands?.[0] || '';
            return {
                provider: firstProvider,
                command: firstCommand,
                intent: '',
                payload: ''
            };
        }

        function stepToModel(step) {
            const command = Array.isArray(step.capabilities) ? step.capabilities[0] : '';
            const provider = getProviderFromCommand(command);
            return {
                provider: provider || 'custom',
                command: command || '',
                intent: step.intent || '',
                payload: step.payload ? JSON.stringify(step.payload, null, 2) : ''
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
                        </label>
                    </div>
                    <button data-role="remove">Remove step</button>
                \`;

                const providerSelect = stepEl.querySelector('[data-role="provider"]');
                const commandSelect = stepEl.querySelector('[data-role="command"]');
                const intentInput = stepEl.querySelector('[data-role="intent"]');
                const payloadInput = stepEl.querySelector('[data-role="payload"]');
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
                fillCommands(commandSelect, step.provider, step.command);
                intentInput.value = step.intent || '';
                payloadInput.value = step.payload || '';

                providerSelect.addEventListener('change', (e) => {
                    step.provider = e.target.value;
                    fillCommands(commandSelect, step.provider, '');
                    step.command = commandSelect.value;
                });
                commandSelect.addEventListener('change', (e) => {
                    step.command = e.target.value;
                });
                intentInput.addEventListener('input', (e) => {
                    step.intent = e.target.value;
                });
                payloadInput.addEventListener('input', (e) => {
                    step.payload = e.target.value;
                });
                removeButton.addEventListener('click', () => {
                    steps.splice(index, 1);
                    render();
                });

                container.appendChild(stepEl);
            });
        }

        function fillCommands(select, provider, current) {
            select.innerHTML = '';
            const group = commandGroups.find(g => g.provider === provider);
            const commands = group ? group.commands : [];
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

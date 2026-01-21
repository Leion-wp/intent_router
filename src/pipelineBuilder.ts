import * as vscode from 'vscode';
import { listPublicCapabilities } from './registry';
import { PipelineFile, ensurePipelineFolder, writePipelineToUri } from './pipelineRunner';
import { gitTemplates } from './providers/gitAdapter';
import { dockerTemplates } from './providers/dockerAdapter';
import { terminalTemplates } from './providers/terminalAdapter';

type CommandGroup = {
    provider: string;
    commands: string[];
};

export class PipelineBuilder {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;

    constructor(private readonly extensionUri: vscode.Uri) {}

    async open(pipeline?: PipelineFile, uri?: vscode.Uri): Promise<void> {
        this.currentUri = uri;
        const panel = vscode.window.createWebviewPanel(
            'intentRouter.pipelineBuilder',
            this.getTitle(pipeline, uri),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle')
                ]
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
        const templates = { ...gitTemplates, ...dockerTemplates, ...terminalTemplates };

        const webviewUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );

        panel.webview.html = this.getHtml(panel.webview, webviewUri, styleUri, {
            pipeline: initialPipeline,
            commandGroups,
            profiles: profileNames,
            templates
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message?.type === 'save') {
                await this.savePipeline(message.data as PipelineFile);
                return;
            }
            // ... (rest of message handling logic)
            // For now, minimal implementation to verify loading
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

    private async savePipeline(pipeline: PipelineFile): Promise<boolean> {
         // Re-use existing save logic
        if (!pipeline.name) {
            vscode.window.showErrorMessage('Pipeline name is required.');
            return false;
        }
        let targetUri = this.currentUri;
        if (!targetUri) {
            const folder = await ensurePipelineFolder();
            if (!folder) return false;
            const fileName = pipeline.name.endsWith('.intent.json') ? pipeline.name : `${pipeline.name}.intent.json`;
            targetUri = vscode.Uri.joinPath(folder, fileName);
            this.currentUri = targetUri;
        }
        await writePipelineToUri(targetUri, pipeline);
        if (this.panel) this.panel.title = this.getTitle(pipeline, targetUri);
        return true;
    }

    private async getCommandGroups(): Promise<CommandGroup[]> {
         // Re-use logic
        const capabilities = listPublicCapabilities();
        const groups = new Map<string, Set<string>>();
        for (const entry of capabilities) {
            const provider = entry.provider || 'custom';
            if (!groups.has(provider)) groups.set(provider, new Set());
            groups.get(provider)?.add(entry.capability);
        }
        return Array.from(groups.entries()).map(([provider, cmds]) => ({
            provider, commands: Array.from(cmds).sort()
        })).sort((a, b) => a.provider.localeCompare(b.provider));
    }

    private getProfileNames(): string[] {
        const profiles = vscode.workspace.getConfiguration('intentRouter').get<any[]>('profiles', []);
        return Array.isArray(profiles) ? profiles.map(p => p?.name).filter(v => typeof v === 'string') : [];
    }

    private getHtml(webview: vscode.Webview, scriptUri: vscode.Uri, styleUri: vscode.Uri, data: any): string {
        const nonce = this.getNonce();
        const payload = JSON.stringify(data);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <title>Pipeline Builder</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const data = ${payload};
        const commandGroups = data.commandGroups || [];
        const profiles = data.profiles || [];
        const templates = data.templates || {};
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
        document.getElementById('open-json').addEventListener('click', () => send('openJson'));
        document.getElementById('generate-prompt').addEventListener('click', () => send('generatePrompt'));
        document.getElementById('import-clipboard').addEventListener('click', () => send('importClipboard'));

        function createEmptyStep() {
            const firstProvider = commandGroups[0]?.provider || '';
            const firstCommand = commandGroups[0]?.commands?.[0] || '';
            const payload = getPayloadTemplate(firstCommand);
            return {
                provider: firstProvider,
                command: firstCommand,
                intent: '',
                payload: payload,
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
                description: step.description || '',
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

        function getPayloadTemplate(command) {
            if (templates[command]) {
                return JSON.stringify(templates[command], null, 2);
            }
            return '{}';
        }

        function getProviderIcon(provider) {
             // Simple hardcoded map for V1
            if (provider === 'git') return '&#xea5d;'; // git-merge
            if (provider === 'docker') return '&#xeb11;'; // server? closest standard codicon
            if (provider === 'terminal') return '&#xeb8e;'; // terminal
            return '&#xea79;'; // code
        }

        function render() {
            const container = document.getElementById('steps');
            container.innerHTML = '';

            steps.forEach((step, index) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'step';

                const icon = getProviderIcon(step.provider);

                stepEl.innerHTML = \`
                    <div class="step-header">
                        <div class="step-title">
                            <span class="provider-icon">\${icon}</span>
                            Step \${index + 1}
                        </div>

                        <div class="step-title">Step \${index + 1}</div>
                        <button class="step-remove" data-role="remove" title="Remove Step">×</button>
                    </div>
                    <div class="row">
                        <label style="flex: 0 0 120px;">
                            <div class="muted">Provider</div>
                            <select data-role="provider"></select>
                        </label>
                        <label>
                            <div class="muted">Action (Capability)</div>
                            <div style="display: flex; gap: 8px;">
                                <input data-role="command-filter" type="text" placeholder="Filter..." style="width: 80px;" />
                                <select data-role="command" style="flex:1;"></select>
                            </div>
                        </label>
                    </div>
                    <div class="row">
                        <label>
                            <div class="muted">Intent</div>
                            <input data-role="intent" type="text" placeholder="Intent name" />
                        </label>
                    </div>
                    <div class="row">
                        <label>
                            <div class="muted">Description (Metadata)</div>
                            <input data-role="description" type="text" placeholder="Description with $(icon)..." />
                        </label>
                    </div>
                    <div class="row">
                        <label>
                            <div class="muted">Payload (JSON)</div>
                            <textarea data-role="payload" placeholder="{}"></textarea>
                            <div class="payload-status" data-role="payload-status"></div>
                        </label>
                    </div>
                \`;

                const providerSelect = stepEl.querySelector('[data-role="provider"]');
                const commandSelect = stepEl.querySelector('[data-role="command"]');
                const commandFilter = stepEl.querySelector('[data-role="command-filter"]');
                const intentInput = stepEl.querySelector('[data-role="intent"]');
                const descriptionInput = stepEl.querySelector('[data-role="description"]');
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
                descriptionInput.value = step.description || '';
                payloadInput.value = step.payload || '';
                updatePayloadValidation(payloadInput, payloadStatus, step.payload);

                providerSelect.addEventListener('change', (e) => {
                    step.provider = e.target.value;
                    step.filter = '';
                    commandFilter.value = '';
                    fillCommands(commandSelect, step.provider, '');
                    step.command = commandSelect.value;

                    // Pre-fill payload if empty or default
                    step.payload = getPayloadTemplate(step.command);
                    payloadInput.value = step.payload;
                    updatePayloadValidation(payloadInput, payloadStatus, step.payload);
                    render(); // Re-render to update icon
                });

                commandFilter.addEventListener('input', (e) => {
                    step.filter = e.target.value;
                    fillCommands(commandSelect, step.provider, step.command, step.filter);
                });

                commandSelect.addEventListener('change', (e) => {
                    step.command = e.target.value;
                    // Pre-fill payload
                    step.payload = getPayloadTemplate(step.command);
                    payloadInput.value = step.payload;
                    updatePayloadValidation(payloadInput, payloadStatus, step.payload);
                });

                intentInput.addEventListener('input', (e) => {
                    step.intent = e.target.value;
                });
                descriptionInput.addEventListener('input', (e) => {
                    step.description = e.target.value;
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
            status.style.color = '#888';
            if (!trimmed) {
                return;
            }
            try {
                JSON.parse(trimmed);
                textarea.classList.add('valid');
                status.textContent = 'JSON valide';
                status.style.color = '#4ec9b0';
            } catch (e) {
                textarea.classList.add('invalid');
                status.textContent = 'JSON invalide';
                status.style.color = '#f14c4c';
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
                    vscode.postMessage({ type: 'error', message: 'Step missing command' });
                    // In a real app we'd show a toast in the webview
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
                    description: step.description,
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
        window.vscode = acquireVsCodeApi();
        window.initialData = ${payload};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
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

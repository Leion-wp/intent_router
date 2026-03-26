import * as vscode from 'vscode';
import { pipelineEventBus } from './eventBus';
import { historyManager } from './historyManager';
import { generateSecureNonce } from './security';
import { LEION_DELIVERY_CATALOG } from './controlPlane/leionDeliveryCatalog';
import { readSalesCockpitFromWorkspace, writeSalesCockpitToWorkspace } from './salesCockpitStore';
import { connectSalesProvider, disconnectSalesProvider, validateSalesProvider } from './salesProviderConnectionService';
import { createGmailDraft, listGmailDraftQueue, openGmailDrafts } from './gmailDraftService';
import { createCockpitGoogleSheet, exportProductToGoogleSheets, importLeadsFromGoogleSheets, openGoogleSheet } from './googleSheetsSyncService';
import { bootstrapProductFromScratch, createProductFromIdeaPath } from './productWizardService';
import { extractFrictionTasks } from './frictionInboxService';
import { discoverMcpTools } from './mcpRegistryService';
import { readEmbeddedUiPreset, resolveUiPreset } from './uiPresetStore';
import { fileExistsInWorkspace } from './workspaceFileService';
import { runAutomaticLeadResearch } from './leadResearchService';
import { enrichCockpitLeads } from './leadEnrichmentService';

type CockpitInitialData = {
    mode: 'cockpit';
    history: any[];
    adminMode: boolean;
    uiPreset: any;
    uiPresetRelease: any;
    controlPlaneCatalog: typeof LEION_DELIVERY_CATALOG;
    salesCockpit: any;
};

function renderTemplateValue(value: string | undefined, lead: any): string {
    const replacements: Record<string, string> = {
        name: String(lead?.contactName || lead?.company || '').trim(),
        company: String(lead?.company || '').trim(),
        role: String(lead?.role || '').trim(),
        pain: String(lead?.pain || '').trim(),
        nextAction: String(lead?.nextAction || '').trim()
    };
    return String(value || '').replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] || '');
}

function buildLeadDraftPayload(template: any, lead: any, fallbackSubject: string): { subject: string; body: string } {
    return {
        subject: renderTemplateValue(template?.subject, lead) || fallbackSubject,
        body: renderTemplateValue(template?.body, lead)
    };
}

function hasConnectedProvider(state: any, providerId: string): boolean {
    return state.providerAccounts.some((provider: any) => provider.provider === providerId && provider.status === 'connected');
}

function mergeImportedTasks(existingTasks: any[], importedTasks: any[]): any[] {
    const preserved = existingTasks.filter((task) => task.kind === 'friction' || task.status === 'done');
    const merged = [...preserved];
    const knownIds = new Set(merged.map((task) => String(task.id || '').trim()));
    for (const task of importedTasks) {
        const id = String(task?.id || '').trim();
        if (!id || knownIds.has(id)) {
            continue;
        }
        merged.push(task);
        knownIds.add(id);
    }
    for (const task of existingTasks) {
        const id = String(task?.id || '').trim();
        if (!id || knownIds.has(id)) {
            continue;
        }
        merged.push(task);
        knownIds.add(id);
    }
    return merged;
}

function autofillProofAssets(existingAssets: any[], history: any[]): { proofAssets: any[]; added: number } {
    const next = [...existingAssets];
    const known = new Set(next.map((asset) => String(asset.id || '').trim()));
    let added = 0;

    for (const run of history.filter((entry) => entry.status === 'success').slice(0, 4)) {
        const title = run.name || `Run ${run.id}`;
        const id = `proof-${title}-${run.timestamp}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        if (known.has(id)) {
            continue;
        }
        next.unshift({
            id,
            title,
            kind: 'run',
            status: 'ready',
            summary: `Run ${run.status} avec ${(run.pullRequests || []).length} PR liee(s).`,
            sourceLabel: 'Pipeline run',
            sourceRef: run.id,
            createdAt: new Date(run.timestamp || Date.now()).toISOString()
        });
        known.add(id);
        added += 1;
    }

    return { proofAssets: next, added };
}

export class CockpitViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'intentRouterCockpit';

    private view: vscode.WebviewView | undefined;
    private readonly viewDisposables: vscode.Disposable[] = [];

    constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    private get extensionUri(): vscode.Uri {
        return this.extensionContext.extensionUri;
    }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this.disposeView();
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle'),
                vscode.Uri.joinPath(this.extensionUri, 'media')
            ]
        };

        const initialData = await this.buildInitialData();
        webviewView.webview.html = this.getHtml(webviewView.webview, initialData);

        this.viewDisposables.push(
            webviewView.onDidDispose(() => {
                if (this.view === webviewView) {
                    this.view = undefined;
                    this.disposeView();
                }
            })
        );

        this.viewDisposables.push(
            webviewView.webview.onDidReceiveMessage((message) => {
                void this.handleMessage(message);
            })
        );

        this.viewDisposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('leionRoots.adminMode')) {
                    void this.pushUiPreset();
                }
            })
        );

        const uiDraftWatcher = vscode.workspace.createFileSystemWatcher('**/leion-roots.ui.draft.json');
        uiDraftWatcher.onDidChange(() => void this.pushUiPreset());
        uiDraftWatcher.onDidCreate(() => void this.pushUiPreset());
        uiDraftWatcher.onDidDelete(() => void this.pushUiPreset());
        this.viewDisposables.push(uiDraftWatcher);

        const salesCockpitWatcher = vscode.workspace.createFileSystemWatcher('**/.intent-router/sales-cockpit.json');
        salesCockpitWatcher.onDidChange(() => void this.pushSalesCockpit());
        salesCockpitWatcher.onDidCreate(() => void this.pushSalesCockpit());
        salesCockpitWatcher.onDidDelete(() => void this.pushSalesCockpit());
        this.viewDisposables.push(salesCockpitWatcher);

        this.viewDisposables.push(
            pipelineEventBus.on((event) => {
                if (
                    event.type === 'pipelineStart' ||
                    event.type === 'pipelineEnd' ||
                    event.type === 'githubPullRequestCreated'
                ) {
                    void this.pushHistory();
                }
            })
        );
    }

    dispose(): void {
        this.disposeView();
        this.view = undefined;
    }

    private disposeView(): void {
        while (this.viewDisposables.length > 0) {
            const disposable = this.viewDisposables.pop();
            try {
                disposable?.dispose();
            } catch {
                // Best effort cleanup for view-bound disposables.
            }
        }
    }

    private async buildInitialData(): Promise<CockpitInitialData> {
        await historyManager.whenReady();
        const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
        return {
            mode: 'cockpit',
            history: historyManager.getHistory(),
            adminMode,
            uiPreset: await resolveUiPreset(this.extensionUri, adminMode),
            uiPresetRelease: await readEmbeddedUiPreset(this.extensionUri),
            controlPlaneCatalog: LEION_DELIVERY_CATALOG,
            salesCockpit: await readSalesCockpitFromWorkspace()
        };
    }

    private async pushHistory(): Promise<void> {
        await historyManager.whenReady();
        await this.postMessage({
            type: 'historyUpdate',
            history: historyManager.getHistory()
        });
    }

    private async pushUiPreset(): Promise<void> {
        const adminMode = vscode.workspace.getConfiguration().get<boolean>('leionRoots.adminMode', false);
        await this.postMessage({
            type: 'adminModeUpdate',
            adminMode
        });
        await this.postMessage({
            type: 'uiPresetUpdate',
            uiPreset: await resolveUiPreset(this.extensionUri, adminMode)
        });
        await this.postMessage({
            type: 'uiPresetReleaseUpdate',
            uiPreset: await readEmbeddedUiPreset(this.extensionUri)
        });
    }

    private async pushSalesCockpit(): Promise<void> {
        await this.postMessage({
            type: 'salesCockpitUpdate',
            salesCockpit: await readSalesCockpitFromWorkspace()
        });
    }

    private async promptBootstrapField(options: vscode.InputBoxOptions): Promise<string | undefined> {
        const value = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            ...options
        });
        if (value === undefined) {
            return undefined;
        }
        return value.trim();
    }

    private async handleMessage(message: any): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        if (message.type === 'salesCockpit.save') {
            const next = await writeSalesCockpitToWorkspace(message.salesCockpit as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.connectProvider') {
            const next = await connectSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            if (next) {
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            }
            return;
        }

        if (message.type === 'salesCockpit.validateProvider') {
            const next = await validateSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.disconnectProvider') {
            const next = await disconnectSalesProvider(this.extensionContext, String(message.providerId || '').trim() as any);
            await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
            return;
        }

        if (message.type === 'salesCockpit.createGmailDraft') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const result = await createGmailDraft(this.extensionContext, {
                    to: String(message.to || '').trim(),
                    subject: String(message.subject || '').trim(),
                    body: String(message.body || '')
                });
                const draftQueue = [
                    {
                        id: result.id || `draft-${Date.now()}`,
                        provider: 'gmail' as const,
                        status: 'drafted' as const,
                        to: String(message.to || '').trim(),
                        subject: String(message.subject || '').trim(),
                        bodyPreview: String(message.body || '').trim().slice(0, 220),
                        createdAt: new Date().toISOString(),
                        leadId: message.leadId ? String(message.leadId).trim() : undefined,
                        draftId: result.id,
                        threadId: result.message?.threadId
                    },
                    ...current.draftQueue.filter((entry: any) => entry.id !== result.id)
                ].slice(0, 25);
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    draftQueue
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                await openGmailDrafts();
                vscode.window.showInformationMessage(`Gmail draft created${result.id ? ` (${result.id})` : ''}.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to create Gmail draft: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.refreshGmailDraftQueue') {
            try {
                const queue = await listGmailDraftQueue(this.extensionContext, 12);
                const current = await readSalesCockpitFromWorkspace();
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    draftQueue: queue.map((entry) => ({
                        id: entry.id,
                        provider: 'gmail',
                        status: 'drafted',
                        to: entry.to,
                        subject: entry.subject,
                        bodyPreview: entry.bodyPreview,
                        createdAt: new Date().toISOString(),
                        draftId: entry.draftId,
                        threadId: entry.threadId
                    }))
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(`Loaded ${queue.length} Gmail draft(s).`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to refresh Gmail drafts: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.syncGoogleSheet') {
            try {
                const direction = String(message.direction || '').trim();
                const sheetUrl = String(message.sheetUrl || '').trim();
                if (!sheetUrl) {
                    throw new Error('Missing Google Sheet URL.');
                }
                if (direction === 'export') {
                    await exportProductToGoogleSheets(this.extensionContext, {
                        sheetUrl,
                        offer: message.offer,
                        leads: Array.isArray(message.leads) ? message.leads : [],
                        proofAssets: Array.isArray(message.proofAssets) ? message.proofAssets : [],
                        tasks: Array.isArray(message.tasks) ? message.tasks : []
                    });
                    await openGoogleSheet(sheetUrl);
                    vscode.window.showInformationMessage('Google Sheets export completed.');
                } else if (direction === 'import') {
                    const imported = await importLeadsFromGoogleSheets(this.extensionContext, sheetUrl);
                    const current = await readSalesCockpitFromWorkspace();
                    const next = await writeSalesCockpitToWorkspace({
                        ...current,
                        leads: imported.leads,
                        tasks: imported.tasks.length > 0 ? imported.tasks : current.tasks,
                        defaultSheetUrl: sheetUrl
                    } as any);
                    await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                    await openGoogleSheet(sheetUrl);
                    vscode.window.showInformationMessage(`Imported ${imported.leads.length} leads and ${imported.tasks.length} actions from Google Sheets.`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Google Sheets sync failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.createProductFromIdea') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const next = await writeSalesCockpitToWorkspace(
                    await createProductFromIdeaPath(current, String(message.ideaPath || current.ideaPath || 'idea.md').trim())
                );
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(`Product created from ${next.ideaPath || 'idea.md'}.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Product wizard failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.bootstrapProduct') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const name = await this.promptBootstrapField({
                    prompt: 'Nom du produit / mini SaaS',
                    value: current.offer.name || 'Nouveau produit Leion',
                    placeHolder: 'Ex: Leion Lead Engine'
                });
                if (name === undefined || !name) {
                    return;
                }
                const audience = await this.promptBootstrapField({
                    prompt: 'Audience cible',
                    value: current.offer.audience || '',
                    placeHolder: 'Ex: agences web, software factories, freelance teams'
                });
                if (audience === undefined || !audience) {
                    return;
                }
                const problem = await this.promptBootstrapField({
                    prompt: 'Probleme principal',
                    value: current.offer.problem || '',
                    placeHolder: 'Ex: prospection outbound lente et artisanale'
                });
                if (problem === undefined || !problem) {
                    return;
                }
                const promise = await this.promptBootstrapField({
                    prompt: 'Promesse produit',
                    value: current.offer.promise || '',
                    placeHolder: 'Ex: generer et operer la boucle commerciale sans quitter VS Code'
                });
                if (promise === undefined || !promise) {
                    return;
                }
                const callToAction = await this.promptBootstrapField({
                    prompt: 'Call to action',
                    value: current.offer.callToAction || '',
                    placeHolder: 'Ex: Reserver une demo de 20 minutes'
                });
                if (callToAction === undefined || !callToAction) {
                    return;
                }
                const proof = await this.promptBootstrapField({
                    prompt: 'Preuve souhaitee (optionnel)',
                    value: current.offer.proof || '',
                    placeHolder: 'Ex: montrer 1 campagne + 1 draft Gmail + 1 preuve operationnelle'
                });
                const next = await writeSalesCockpitToWorkspace(
                    bootstrapProductFromScratch(current, {
                        name,
                        audience,
                        problem,
                        promise,
                        callToAction,
                        proof: proof || current.offer.proof
                    })
                );
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(`Produit initialise depuis le cockpit: ${next.offer.name}.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Bootstrap produit failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.autofill') {
            try {
                let current = await readSalesCockpitFromWorkspace();
                let ideaImported = false;
                let frictionsImported = 0;
                let draftsImported = 0;
                let sheetLeadCount = 0;
                let sheetActionCount = 0;
                let proofAdded = 0;

                if (current.ideaPath && await fileExistsInWorkspace(current.ideaPath)) {
                    current = await createProductFromIdeaPath(current, current.ideaPath);
                    ideaImported = true;
                }

                if (current.implementPath && await fileExistsInWorkspace(current.implementPath)) {
                    const frictionResult = await extractFrictionTasks(current, current.implementPath);
                    current = frictionResult.nextState;
                    frictionsImported = frictionResult.importedCount;
                }

                const gmailProvider = current.providerAccounts.find((provider) => provider.provider === 'email');
                if (gmailProvider?.status === 'connected') {
                    try {
                        const queue = await listGmailDraftQueue(this.extensionContext, 12);
                        draftsImported = queue.length;
                        current = {
                            ...current,
                            draftQueue: queue.map((entry) => ({
                                id: entry.id,
                                provider: 'gmail',
                                status: 'drafted',
                                to: entry.to,
                                subject: entry.subject,
                                bodyPreview: entry.bodyPreview,
                                createdAt: new Date().toISOString(),
                                draftId: entry.draftId,
                                threadId: entry.threadId
                            }))
                        } as any;
                    } catch {
                        // Leave drafts unchanged when Gmail refresh fails during autofill.
                    }
                }

                const sheetsProvider = current.providerAccounts.find((provider) => provider.provider === 'google_sheets');
                if (current.defaultSheetUrl && sheetsProvider?.status === 'connected') {
                    try {
                        const imported = await importLeadsFromGoogleSheets(this.extensionContext, current.defaultSheetUrl);
                        sheetLeadCount = imported.leads.length;
                        sheetActionCount = imported.tasks.length;
                        current = {
                            ...current,
                            leads: imported.leads.length > 0 ? imported.leads : current.leads,
                            tasks: imported.tasks.length > 0 ? mergeImportedTasks(current.tasks, imported.tasks) : current.tasks
                        } as any;
                    } catch {
                        // Leave sheet-backed entities unchanged when sync fails during autofill.
                    }
                }

                const proofResult = autofillProofAssets(current.proofAssets, historyManager.getHistory());
                current = {
                    ...current,
                    proofAssets: proofResult.proofAssets
                } as any;
                proofAdded = proofResult.added;

                const next = await writeSalesCockpitToWorkspace(current as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(
                    `Cockpit rempli automatiquement: idea ${ideaImported ? 'OK' : 'skip'}, frictions +${frictionsImported}, drafts ${draftsImported}, leads ${sheetLeadCount}, actions ${sheetActionCount}, preuves +${proofAdded}.`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`Auto-fill cockpit failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.runLeadResearch') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const researched = await runAutomaticLeadResearch(current.offer, current.leads, 12);
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    leads: [...current.leads, ...researched.leads],
                    tasks: researched.leads.length > 0
                        ? [
                            {
                                id: `research-${Date.now()}`,
                                title: `Qualifier ${researched.leads.length} lead(s) auto`,
                                status: 'todo',
                                kind: 'outreach',
                                owner: 'founder',
                                detail: `Requetes: ${researched.queries.join(' | ')}`
                            },
                            ...current.tasks
                        ]
                        : current.tasks
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(
                    researched.leads.length > 0
                        ? `Recherche automatique terminee: ${researched.leads.length} lead(s) ajoutes.`
                        : 'Recherche automatique terminee, mais aucun lead exploitable n a ete trouve avec les requetes actuelles.'
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`Lead research failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.enrichLeads') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const enriched = await enrichCockpitLeads(current.leads, 8);
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    leads: enriched.leads,
                    tasks: enriched.enrichedCount > 0
                        ? [
                            {
                                id: `enrichment-${Date.now()}`,
                                title: `Relire ${enriched.enrichedCount} lead(s) enrichi(s)`,
                                status: 'todo',
                                kind: 'follow_up',
                                owner: 'founder',
                                detail: enriched.summaries.map((summary) => `${summary.company}${summary.emails[0] ? ` -> ${summary.emails[0]}` : ''}`).join(' | ')
                            },
                            ...current.tasks
                        ]
                        : current.tasks
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(
                    enriched.enrichedCount > 0
                        ? `Enrichissement termine: ${enriched.enrichedCount} lead(s) mis a jour, ${enriched.leadsWithEmail} avec email.`
                        : 'Enrichissement termine, mais aucun lead supplementaire n a pu etre enrichi automatiquement.'
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`Lead enrichment failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.pushGoogleSheet') {
            try {
                let current = await readSalesCockpitFromWorkspace();
                if (!hasConnectedProvider(current, 'google_sheets')) {
                    throw new Error('Google Workspace n est pas connecte.');
                }
                if (!current.defaultSheetUrl) {
                    const created = await createCockpitGoogleSheet(this.extensionContext, {
                        title: `${current.offer.name} - Leion Cockpit`,
                        offer: current.offer,
                        leads: current.leads,
                        proofAssets: current.proofAssets,
                        tasks: current.tasks
                    });
                    current = await writeSalesCockpitToWorkspace({
                        ...current,
                        defaultSheetUrl: created.sheetUrl,
                        providerAccounts: current.providerAccounts.map((provider: any) => provider.provider === 'google_sheets'
                            ? {
                                ...provider,
                                endpointUrl: created.sheetUrl,
                                lastValidatedAt: new Date().toISOString(),
                                lastValidationMessage: 'Google Sheet creee puis remplie automatiquement.'
                            }
                            : provider)
                    } as any);
                }

                const sheetUrl = String(current.defaultSheetUrl || '').trim();
                if (!sheetUrl) {
                    throw new Error('Aucune Google Sheet n est disponible pour ce produit.');
                }

                await exportProductToGoogleSheets(this.extensionContext, {
                    sheetUrl,
                    offer: current.offer,
                    leads: current.leads,
                    proofAssets: current.proofAssets,
                    tasks: current.tasks
                });
                await openGoogleSheet(sheetUrl);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: current });
                vscode.window.showInformationMessage('Le produit actif a ete pousse vers Google Sheets.');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Push Google Sheet failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.generateLeadDrafts') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                if (!hasConnectedProvider(current, 'email')) {
                    throw new Error('Gmail n est pas connecte.');
                }
                const template = current.templates.find((entry: any) => entry.channel === 'email');
                if (!template) {
                    throw new Error('Aucun template email n est disponible.');
                }
                const existingDraftLeadIds = new Set(
                    current.draftQueue
                        .map((entry: any) => String(entry.leadId || '').trim())
                        .filter(Boolean)
                );
                const readyLeads = current.leads
                    .filter((lead: any) => !!lead.email && lead.status !== 'won' && lead.status !== 'lost' && !existingDraftLeadIds.has(String(lead.id || '').trim()))
                    .slice(0, 5);

                if (readyLeads.length === 0) {
                    vscode.window.showInformationMessage('Aucun lead enrichi n est pret pour un draft Gmail.');
                    return;
                }

                const createdQueueItems: any[] = [];
                const updatedLeads = [...current.leads];
                for (const lead of readyLeads) {
                    const rendered = buildLeadDraftPayload(template, lead, current.offer.name);
                    const recipient = String(lead.email || '').trim();
                    if (!recipient) {
                        continue;
                    }
                    const result = await createGmailDraft(this.extensionContext, {
                        to: recipient,
                        subject: rendered.subject,
                        body: rendered.body
                    });
                    createdQueueItems.push({
                        id: result.id || `draft-${lead.id}-${Date.now()}`,
                        provider: 'gmail',
                        status: 'drafted',
                        to: recipient,
                        subject: rendered.subject,
                        bodyPreview: rendered.body.trim().slice(0, 220),
                        createdAt: new Date().toISOString(),
                        leadId: lead.id,
                        draftId: result.id,
                        threadId: result.message?.threadId
                    });
                    const index = updatedLeads.findIndex((entry: any) => entry.id === lead.id);
                    if (index >= 0) {
                        updatedLeads[index] = {
                            ...updatedLeads[index],
                            nextAction: 'Relire le draft Gmail genere puis envoyer manuellement.',
                            status: updatedLeads[index].status === 'target' ? 'contacted' : updatedLeads[index].status
                        };
                    }
                }

                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    leads: updatedLeads,
                    draftQueue: [...createdQueueItems, ...current.draftQueue].slice(0, 30)
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                await openGmailDrafts();
                vscode.window.showInformationMessage(`${createdQueueItems.length} draft(s) Gmail generes depuis les leads enrichis.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Generate drafts failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.runLeadPipeline') {
            try {
                let current = await readSalesCockpitFromWorkspace();
                const researched = await runAutomaticLeadResearch(current.offer, current.leads, 8);
                current = await writeSalesCockpitToWorkspace({
                    ...current,
                    leads: [...current.leads, ...researched.leads]
                } as any);

                const enriched = await enrichCockpitLeads(current.leads, 8);
                current = await writeSalesCockpitToWorkspace({
                    ...current,
                    leads: enriched.leads
                } as any);

                if (hasConnectedProvider(current, 'google_sheets')) {
                    if (!current.defaultSheetUrl) {
                        const created = await createCockpitGoogleSheet(this.extensionContext, {
                            title: `${current.offer.name} - Leion Cockpit`,
                            offer: current.offer,
                            leads: current.leads,
                            proofAssets: current.proofAssets,
                            tasks: current.tasks
                        });
                        current = await writeSalesCockpitToWorkspace({
                            ...current,
                            defaultSheetUrl: created.sheetUrl
                        } as any);
                    }
                    const sheetUrl = String(current.defaultSheetUrl || '').trim();
                    if (!sheetUrl) {
                        throw new Error('Aucune Google Sheet n est disponible pour ce produit.');
                    }
                    await exportProductToGoogleSheets(this.extensionContext, {
                        sheetUrl,
                        offer: current.offer,
                        leads: current.leads,
                        proofAssets: current.proofAssets,
                        tasks: current.tasks
                    });
                }

                if (hasConnectedProvider(current, 'email')) {
                    const template = current.templates.find((entry: any) => entry.channel === 'email');
                    const existingDraftLeadIds = new Set(
                        current.draftQueue
                            .map((entry: any) => String(entry.leadId || '').trim())
                            .filter(Boolean)
                    );
                    const readyLeads = current.leads
                        .filter((lead: any) => !!lead.email && lead.status !== 'won' && lead.status !== 'lost' && !existingDraftLeadIds.has(String(lead.id || '').trim()))
                        .slice(0, 5);
                    if (template && readyLeads.length > 0) {
                        const createdQueueItems: any[] = [];
                        const updatedLeads = [...current.leads];
                        for (const lead of readyLeads) {
                            const rendered = buildLeadDraftPayload(template, lead, current.offer.name);
                            const recipient = String(lead.email || '').trim();
                            if (!recipient) {
                                continue;
                            }
                            const result = await createGmailDraft(this.extensionContext, {
                                to: recipient,
                                subject: rendered.subject,
                                body: rendered.body
                            });
                            createdQueueItems.push({
                                id: result.id || `draft-${lead.id}-${Date.now()}`,
                                provider: 'gmail',
                                status: 'drafted',
                                to: recipient,
                                subject: rendered.subject,
                                bodyPreview: rendered.body.trim().slice(0, 220),
                                createdAt: new Date().toISOString(),
                                leadId: lead.id,
                                draftId: result.id,
                                threadId: result.message?.threadId
                            });
                            const index = updatedLeads.findIndex((entry: any) => entry.id === lead.id);
                            if (index >= 0) {
                                updatedLeads[index] = {
                                    ...updatedLeads[index],
                                    nextAction: 'Relire le draft Gmail genere puis envoyer manuellement.',
                                    status: updatedLeads[index].status === 'target' ? 'contacted' : updatedLeads[index].status
                                };
                            }
                        }
                        current = await writeSalesCockpitToWorkspace({
                            ...current,
                            leads: updatedLeads,
                            draftQueue: [...createdQueueItems, ...current.draftQueue].slice(0, 30)
                        } as any);
                        await openGmailDrafts();
                    }
                }

                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: current });
                vscode.window.showInformationMessage(
                    `Pipeline leads termine: +${researched.leads.length} leads recherches, ${enriched.enrichedCount} enrichis, sheet ${current.defaultSheetUrl ? 'OK' : 'skip'}, drafts ${current.draftQueue.length}.`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`Lead pipeline failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.createGoogleSheet') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const title = String(message.title || '').trim() || `${current.offer.name} - Leion Cockpit`;
                const result = await createCockpitGoogleSheet(this.extensionContext, {
                    title,
                    offer: current.offer,
                    leads: current.leads,
                    proofAssets: current.proofAssets,
                    tasks: current.tasks
                });
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    defaultSheetUrl: result.sheetUrl,
                    providerAccounts: current.providerAccounts.map((provider) => provider.provider === 'google_sheets'
                        ? {
                            ...provider,
                            endpointUrl: result.sheetUrl,
                            lastValidatedAt: new Date().toISOString(),
                            lastValidationMessage: 'Google Sheet creee depuis le cockpit.'
                        }
                        : provider)
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                await openGoogleSheet(result.sheetUrl);
                vscode.window.showInformationMessage('Google Sheet cockpit creee et reliee au produit actif.');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Create Google Sheet failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.extractFrictions') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const result = await extractFrictionTasks(current, String(message.implementPath || current.implementPath || 'implement.md').trim());
                const next = await writeSalesCockpitToWorkspace(result.nextState);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(`Imported ${result.importedCount} friction task(s) from implement.md.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Friction inbox failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'salesCockpit.discoverMcpTools') {
            try {
                const current = await readSalesCockpitFromWorkspace();
                const serverId = String(message.serverId || '').trim();
                const server = current.mcpServers.find((entry) => entry.id === serverId);
                if (!server) {
                    throw new Error('Unknown MCP server.');
                }
                const result = await discoverMcpTools(server);
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    mcpServers: current.mcpServers.map((entry) => entry.id === serverId ? {
                        ...entry,
                        status: result.status,
                        toolSummary: result.tools.map((tool) => tool.name),
                        tools: result.tools,
                        lastDiscoveredAt: new Date().toISOString(),
                        lastDiscoveryError: undefined,
                        notes: entry.notes ? `${entry.notes}\n\n${result.note}` : result.note
                    } : entry)
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showInformationMessage(`MCP discovery loaded ${result.tools.length} tool(s).`);
            } catch (error: any) {
                const current = await readSalesCockpitFromWorkspace();
                const serverId = String(message.serverId || '').trim();
                const next = await writeSalesCockpitToWorkspace({
                    ...current,
                    mcpServers: current.mcpServers.map((entry) => entry.id === serverId ? {
                        ...entry,
                        status: entry.endpointUrl || entry.command ? 'configured' : 'not_configured',
                        lastDiscoveredAt: new Date().toISOString(),
                        lastDiscoveryError: error?.message || String(error)
                    } : entry)
                } as any);
                await this.postMessage({ type: 'salesCockpitUpdate', salesCockpit: next });
                vscode.window.showErrorMessage(`MCP discovery failed: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'copyToClipboard') {
            await vscode.env.clipboard.writeText(String(message.text || ''));
            return;
        }

        if (message.type === 'openExternal') {
            try {
                const raw = String(message.url || '').trim();
                const uri = vscode.Uri.parse(raw);
                if (uri.scheme !== 'http' && uri.scheme !== 'https') {
                    throw new Error('Only http/https links are allowed.');
                }
                await vscode.env.openExternal(uri);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open link: ${error?.message || error}`);
            }
            return;
        }

        if (message.type === 'openWorkspaceFile') {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!workspaceRoot) {
                    throw new Error('Open a workspace folder first.');
                }
                const rawPath = String(message.path || '').trim().replace(/\\/g, '/');
                if (!rawPath) {
                    throw new Error('Missing workspace-relative path.');
                }
                if (rawPath.startsWith('/') || rawPath.includes('..')) {
                    throw new Error('Only safe workspace-relative paths are allowed.');
                }
                const parts = rawPath.split('/').map((part) => part.trim()).filter(Boolean);
                const uri = vscode.Uri.joinPath(workspaceRoot, ...parts);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open file: ${error?.message || error}`);
            }
        }
    }

    private async postMessage(message: Record<string, unknown>): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            await this.view.webview.postMessage(message);
        } catch {
            // Ignore best-effort sync failures when the view is not ready.
        }
    }

    private getHtml(webview: vscode.Webview, initialData: CockpitInitialData): string {
        const nonce = generateSecureNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );
        const serializedInitialData = JSON.stringify(initialData)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <link href="${codiconUri}" rel="stylesheet" />
    <title>Leion Cockpit</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.vscode = acquireVsCodeApi();
        window.initialData = ${serializedInitialData};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

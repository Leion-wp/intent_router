import React, { useEffect, useMemo, useState } from 'react';
import ControlPlanePanel, { CONTROL_PLANE_MODULES, ControlPlaneModuleId } from './components/sidebar/ControlPlanePanel';
import { useSalesCockpitState } from './hooks/useSalesCockpitState';
import { isInboundMessage, PipelineRun, WebviewOutboundMessage } from './types/messages';
import { applyThemeTokensToRoot, defaultThemeTokens, normalizeUiPreset, UiPreset } from './types/theme';
import { DeliveryCatalogRecord } from './utils/controlPlaneDashboardUtils';
import { createSalesCockpitProduct, normalizeSalesCockpitState, selectSalesCockpitProduct } from './utils/salesCockpitUtils';

declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

const shellStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'radial-gradient(circle at top left, rgba(0, 162, 255, 0.14), transparent 36%), radial-gradient(circle at bottom right, rgba(0, 209, 122, 0.12), transparent 32%), #0b0b0e',
  color: '#e0e0e0' // Changed from #f5f7fb for better general consistency, or keeping #e0e0e0 to match index.css
};

const moduleCardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.03)',
  padding: '12px',
  cursor: 'pointer',
  textAlign: 'left'
};

function postMessage(message: WebviewOutboundMessage): void {
  window.vscode?.postMessage(message);
}

export default function CockpitApp() {
  const catalog = (window.initialData?.controlPlaneCatalog || null) as DeliveryCatalogRecord | null;
  const [history, setHistory] = useState<PipelineRun[]>(() => Array.isArray(window.initialData?.history) ? window.initialData.history : []);
  const [uiPreset, setUiPreset] = useState<UiPreset>(() => normalizeUiPreset(window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } }));
  const [activeModule, setActiveModule] = useState<ControlPlaneModuleId>('home');
  const { salesCockpit, saveSalesCockpit } = useSalesCockpitState();

  useEffect(() => {
    applyThemeTokensToRoot(uiPreset.theme.tokens);
  }, [uiPreset]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isInboundMessage(event.data)) return;
      if (event.data.type === 'historyUpdate') {
        setHistory(Array.isArray(event.data.history) ? event.data.history : []);
        return;
      }
      if (event.data.type === 'uiPresetUpdate') {
        setUiPreset(normalizeUiPreset(event.data.uiPreset));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const cockpitCounts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const openLeads = salesCockpit.leads.filter((lead) => lead.status !== 'won' && lead.status !== 'lost').length;
    const overdueTasks = salesCockpit.tasks.filter((task) => task.status === 'todo' && !!task.dueDate && task.dueDate < today).length;
    const openTasks = salesCockpit.tasks.filter((task) => task.status === 'todo').length;
    const readyProviders = salesCockpit.providerAccounts.filter((provider) => provider.status === 'connected' || provider.status === 'configured').length;
    const unhealthyProviders = salesCockpit.providerAccounts.filter((provider) => provider.health === 'warning' || provider.health === 'error').length;
    const proofAssets = salesCockpit.proofAssets.length;
    const activeCampaigns = salesCockpit.campaigns.filter((campaign) => campaign.active).length;
    const mcpServers = salesCockpit.mcpServers.length;
    const discoveredMcpTools = salesCockpit.mcpServers.reduce((sum, server) => sum + (server.tools?.length || 0), 0);
    const draftQueue = salesCockpit.draftQueue.length;
    const frictionTasks = salesCockpit.tasks.filter((task) => task.kind === 'friction' && task.status === 'todo').length;
    return {
      openLeads,
      overdueTasks,
      openTasks,
      readyProviders,
      unhealthyProviders,
      proofAssets,
      activeCampaigns,
      mcpServers,
      discoveredMcpTools,
      draftQueue,
      frictionTasks
    };
  }, [salesCockpit]);

  const summaryCards = useMemo(() => [
    { label: 'Produits', value: String(salesCockpit.products.length) },
    { label: 'Leads ouverts', value: String(cockpitCounts.openLeads) },
    { label: 'Actions ouvertes', value: String(cockpitCounts.openTasks) },
    { label: 'Providers prets', value: String(cockpitCounts.readyProviders) },
    { label: 'Serveurs MCP', value: String(cockpitCounts.mcpServers) },
    { label: 'Preuves', value: String(cockpitCounts.proofAssets) }
  ], [cockpitCounts, salesCockpit.products.length]);

  const moduleBadges = useMemo<Record<ControlPlaneModuleId, string>>(() => ({
    home: cockpitCounts.overdueTasks > 0 ? `${cockpitCounts.overdueTasks} urgences` : `${cockpitCounts.openTasks} actions`,
    products: `${salesCockpit.products.length} actifs`,
    prospects: `${cockpitCounts.openLeads} leads`,
    contact: cockpitCounts.draftQueue > 0 ? `${cockpitCounts.draftQueue} drafts` : `${cockpitCounts.activeCampaigns} campagnes`,
    funnel: `${salesCockpit.weeklyTargets.outbound}/sem`,
    proof: `${cockpitCounts.proofAssets} preuves`,
    deploy: `${salesCockpit.pipelinePaths.length} pipelines`,
    follow_up: cockpitCounts.frictionTasks > 0 ? `${cockpitCounts.frictionTasks} frictions` : `${cockpitCounts.openTasks} en file`,
    providers: cockpitCounts.unhealthyProviders > 0 ? `${cockpitCounts.unhealthyProviders} alertes` : `${cockpitCounts.readyProviders}/${salesCockpit.providerAccounts.length} prets`,
    mcp: cockpitCounts.discoveredMcpTools > 0 ? `${cockpitCounts.discoveredMcpTools} outils` : `${cockpitCounts.mcpServers} serveurs`
  }), [cockpitCounts, salesCockpit]);

  const openWorkspaceFile = (path: string) => postMessage({ type: 'openWorkspaceFile', path });
  const copyToClipboard = (text: string) => postMessage({ type: 'copyToClipboard', text });
  const openExternal = (url: string) => postMessage({ type: 'openExternal', url });
  const connectProvider = (providerId: string) => postMessage({ type: 'salesCockpit.connectProvider', providerId });
  const validateProvider = (providerId: string) => postMessage({ type: 'salesCockpit.validateProvider', providerId });
  const disconnectProvider = (providerId: string) => postMessage({ type: 'salesCockpit.disconnectProvider', providerId });
  const createGmailDraft = (to: string, subject: string, body: string, leadId?: string) => postMessage({ type: 'salesCockpit.createGmailDraft', to, subject, body, leadId });
  const refreshGmailDraftQueue = () => postMessage({ type: 'salesCockpit.refreshGmailDraftQueue' });
  const syncGoogleSheet = (direction: 'export' | 'import', sheetUrl: string, offer?: any, leads?: any[], proofAssets?: any[], tasks?: any[]) =>
    postMessage({ type: 'salesCockpit.syncGoogleSheet', direction, sheetUrl, offer, leads, proofAssets, tasks });
  const createProductFromIdea = (ideaPath: string) => postMessage({ type: 'salesCockpit.createProductFromIdea', ideaPath });
  const extractFrictions = (implementPath: string) => postMessage({ type: 'salesCockpit.extractFrictions', implementPath });
  const discoverMcpTools = (serverId: string) => postMessage({ type: 'salesCockpit.discoverMcpTools', serverId });

  const switchProduct = (productId: string) => {
    saveSalesCockpit(selectSalesCockpitProduct(salesCockpit, productId));
  };

  const createProduct = () => {
    const name = window.prompt('Nom du produit');
    if (!name?.trim()) {
      return;
    }
    const nextProduct = createSalesCockpitProduct(name.trim());
    const next = normalizeSalesCockpitState({
      ...salesCockpit,
      products: [...salesCockpit.products, nextProduct],
      activeProductId: nextProduct.id
    });
    saveSalesCockpit(next);
  };

  return (
    <div style={shellStyle}>
      <header style={{ padding: '18px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.68 }}>Leion Cockpit</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>1 SaaS = 1 interface + 1 a 3 pipelines</div>
            <div style={{ fontSize: '12px', lineHeight: 1.6, opacity: 0.82, marginTop: '6px', maxWidth: '860px' }}>
              Opere la surface commerciale du produit pendant que Intent Router reste le moteur. Construis l offre, gere l outbound, travaille le funnel et ouvre les assets delivery depuis un seul cockpit.
            </div>
            <div style={{ fontSize: '11px', lineHeight: 1.5, opacity: 0.74, marginTop: '8px' }}>
              Produit actif : <strong>{salesCockpit.offer.name}</strong> · Etape : <strong>{salesCockpit.productStage}</strong> · Pipelines : <strong>{salesCockpit.pipelinePaths.length}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
            <select
              className="nodrag"
              value={salesCockpit.activeProductId}
              onChange={(event) => switchProduct(event.target.value)}
              style={{ ...moduleCardStyle, padding: '10px 12px', minWidth: '220px' }}
            >
              {salesCockpit.products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <button type="button" className="nodrag cp-card-hover cp-btn-secondary" onClick={createProduct} style={{ ...moduleCardStyle, padding: '10px 12px' }}>Nouveau produit</button>
            {catalog && (
              <>
                <button type="button" className="nodrag cp-card-hover cp-btn-secondary" onClick={() => openWorkspaceFile(catalog.docs.pricing)} style={{ ...moduleCardStyle, padding: '10px 12px' }}>Pricing</button>
                <button type="button" className="nodrag cp-card-hover cp-btn-secondary" onClick={() => openWorkspaceFile(catalog.docs.salesPlaybook)} style={{ ...moduleCardStyle, padding: '10px 12px' }}>Playbook vente</button>
                <button type="button" className="nodrag cp-card-hover cp-btn-secondary" onClick={() => openWorkspaceFile(catalog.docs.proofScript)} style={{ ...moduleCardStyle, padding: '10px 12px' }}>Script demo</button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px' }}>
          {summaryCards.map((card) => (
            <div key={card.label} style={{ ...moduleCardStyle, cursor: 'default' }}>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>{card.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>{card.value}</div>
            </div>
          ))}
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: '14px', padding: '14px' }}>
        <aside style={{ minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {CONTROL_PLANE_MODULES.map((module) => {
            const selected = module.id === activeModule;
            return (
              <button
                key={module.id}
                type="button"
                className="nodrag cp-card-hover"
                onClick={() => setActiveModule(module.id)}
                style={{
                  ...moduleCardStyle,
                  borderColor: selected ? 'rgba(0, 162, 255, 0.45)' : 'rgba(255,255,255,0.08)',
                  background: selected ? 'rgba(0, 162, 255, 0.14)' : 'rgba(255,255,255,0.03)',
                  boxShadow: selected ? '0 0 0 1px rgba(0, 162, 255, 0.12) inset' : 'none'
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.64 }}>{module.kicker}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{module.title}</div>
                  <span style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '999px', background: selected ? 'rgba(0, 162, 255, 0.2)' : 'rgba(255,255,255,0.06)', opacity: 0.9 }}>
                    {moduleBadges[module.id]}
                  </span>
                </div>
                <div style={{ fontSize: '11px', lineHeight: 1.5, opacity: 0.82, marginTop: '6px' }}>{module.description}</div>
              </button>
            );
          })}
        </aside>

        <main style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', background: 'rgba(7, 9, 13, 0.72)', backdropFilter: 'blur(18px)' }}>
          <ControlPlanePanel
            history={history}
            catalog={catalog}
            salesCockpit={salesCockpit}
            onSaveSalesCockpit={saveSalesCockpit}
            onOpenWorkspaceFile={openWorkspaceFile}
            onCopyToClipboard={copyToClipboard}
            onOpenExternal={openExternal}
            variant="cockpit"
            activeModule={activeModule}
            onSelectModule={setActiveModule}
            onConnectProvider={connectProvider}
            onValidateProvider={validateProvider}
            onDisconnectProvider={disconnectProvider}
            onCreateGmailDraft={createGmailDraft}
            onRefreshGmailDraftQueue={refreshGmailDraftQueue}
            onSyncGoogleSheet={syncGoogleSheet}
            onCreateProductFromIdea={createProductFromIdea}
            onExtractFrictions={extractFrictions}
            onDiscoverMcpTools={discoverMcpTools}
          />
        </main>
      </div>
    </div>
  );
}

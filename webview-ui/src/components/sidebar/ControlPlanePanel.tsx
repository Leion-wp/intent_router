import React, { useMemo, useState } from 'react';
import { PipelineRun } from '../../types/messages';
import { buildControlPlaneDashboardModel, DeliveryCatalogRecord } from '../../utils/controlPlaneDashboardUtils';
import {
  buildSalesCockpitModel,
  renderSalesTemplate,
  SALES_LEAD_STAGES,
  SALES_PROVIDER_DEFINITIONS,
  SALES_PROVIDER_MODES,
  SALES_PROVIDER_STATUSES,
  SALES_TASK_KINDS,
  SalesCockpitFunnel,
  SalesCockpitLead,
  SalesCockpitOffer,
  SalesProviderAccount,
  SalesProviderMode,
  SalesProviderStatus,
  SalesCockpitState,
  SalesTaskKind,
  slugify
} from '../../utils/salesCockpitUtils';

export type ControlPlaneModuleId = 'offer' | 'prospects' | 'contact' | 'funnel' | 'deploy' | 'follow_up' | 'settings';

export const CONTROL_PLANE_MODULES: Array<{
  id: ControlPlaneModuleId;
  title: string;
  kicker: string;
  description: string;
}> = [
  {
    id: 'offer',
    title: 'Offer Builder',
    kicker: 'Define the product',
    description: 'Shape the promise, the proof, and the call to action for one sellable SaaS.'
  },
  {
    id: 'prospects',
    title: 'Prospect Generator',
    kicker: 'Build the list',
    description: 'Track target accounts, pains, contacts, and next actions in one place.'
  },
  {
    id: 'contact',
    title: 'Prospect Contact',
    kicker: 'Run outbound',
    description: 'Operate campaigns, reuse templates, and copy messages without leaving VS Code.'
  },
  {
    id: 'funnel',
    title: 'Sales Funnel',
    kicker: 'Control the motion',
    description: 'Set weekly targets and formalize how a lead moves from first touch to pilot.'
  },
  {
    id: 'deploy',
    title: 'Deployer',
    kicker: 'Ship the surface',
    description: 'Open pricing, proof assets, landing pages, and the delivery pipelines that back the offer.'
  },
  {
    id: 'follow_up',
    title: 'Offer Follow-up',
    kicker: 'Close the loop',
    description: 'Work the action queue, monitor proof, and push active deals to the next stage.'
  },
  {
    id: 'settings',
    title: 'Settings',
    kicker: 'Connect the surfaces',
    description: 'Manage real provider connections, credentials, and safe handoff modes.'
  }
];

type ControlPlanePanelProps = {
  history: PipelineRun[];
  catalog: DeliveryCatalogRecord | null;
  salesCockpit: SalesCockpitState;
  onSaveSalesCockpit: (next: SalesCockpitState) => void;
  onOpenWorkspaceFile: (path: string) => void;
  onCopyToClipboard: (text: string) => void;
  onOpenExternal: (url: string) => void;
  variant?: 'sidebar' | 'cockpit';
  activeModule?: ControlPlaneModuleId;
  onSelectModule?: (moduleId: ControlPlaneModuleId) => void;
  onConnectProvider?: (providerId: string) => void;
  onValidateProvider?: (providerId: string) => void;
  onDisconnectProvider?: (providerId: string) => void;
};

type LeadDraft = {
  company: string;
  contactName: string;
  role: string;
  pain: string;
  nextAction: string;
  dueDate: string;
  profileUrl: string;
};

type TaskDraft = {
  title: string;
  kind: SalesTaskKind;
  dueDate: string;
  leadId: string;
};

const sectionStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  padding: '16px',
  background: 'rgba(255,255,255,0.02)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
};

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '10px',
  padding: '12px',
  background: 'rgba(0,0,0,0.14)',
  transition: 'background 0.2s ease, border-color 0.2s ease'
};

const buttonStyle: React.CSSProperties = {
  /* Deprecated inline style, migrated to cp-btn-secondary and cp-btn-primary classes in index.css */
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e0e0e0',
  padding: '8px 10px',
  fontSize: '11px'
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '70px',
  resize: 'vertical'
};

function formatPrice(plan: { priceEur?: number; setupFeeEur?: number; billingInterval?: string }): string {
  const recurring = typeof plan.priceEur === 'number'
    ? `${plan.priceEur.toLocaleString('fr-FR')} EUR${plan.billingInterval === 'monthly' ? ' / month' : ''}`
    : 'Free';
  if (typeof plan.setupFeeEur !== 'number') return recurring;
  return `${plan.setupFeeEur.toLocaleString('fr-FR')} EUR setup + ${recurring}`;
}

function formatTimestamp(value: number | null): string {
  if (!value) return 'Not run yet';
  return new Date(value).toLocaleString();
}

function formatStageLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: string): { label: string; color: string; background: string; border: string } {
  if (status === 'success') return { label: 'Success', color: '#4caf50', background: 'rgba(76, 175, 80, 0.12)', border: 'rgba(76, 175, 80, 0.3)' };
  if (status === 'failure') return { label: 'Failure', color: '#f44336', background: 'rgba(244, 67, 54, 0.12)', border: 'rgba(244, 67, 54, 0.3)' };
  if (status === 'running') return { label: 'Running', color: '#f2c94c', background: 'rgba(242, 201, 76, 0.12)', border: 'rgba(242, 201, 76, 0.3)' };
  if (status === 'cancelled') return { label: 'Cancelled', color: '#94a3b8', background: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
  return { label: 'Not run', color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.3)' };
}

function createLeadDraft(): LeadDraft {
  return {
    company: '',
    contactName: '',
    role: '',
    pain: '',
    nextAction: '',
    dueDate: '',
    profileUrl: ''
  };
}

function createTaskDraft(): TaskDraft {
  return {
    title: '',
    kind: 'outreach',
    dueDate: '',
    leadId: ''
  };
}

function mergeLeadPatch(lead: SalesCockpitLead, patch: Partial<SalesCockpitLead>): SalesCockpitLead {
  return {
    ...lead,
    ...patch,
    dueDate: patch.dueDate === '' ? undefined : patch.dueDate ?? lead.dueDate,
    profileUrl: patch.profileUrl === '' ? undefined : patch.profileUrl ?? lead.profileUrl,
    notes: patch.notes === '' ? undefined : patch.notes ?? lead.notes
  };
}

function buildOfferBrief(offer: SalesCockpitOffer): string {
  return [
    offer.name,
    '',
    `Audience: ${offer.audience}`,
    `Problem: ${offer.problem}`,
    `Promise: ${offer.promise}`,
    `Proof: ${offer.proof}`,
    `CTA: ${offer.callToAction}`
  ].join('\n');
}

function buildFunnelBrief(funnel: SalesCockpitFunnel): string {
  return [
    'Leion Funnel',
    '',
    `Acquisition: ${funnel.acquisition}`,
    `Qualification: ${funnel.qualification}`,
    `Demo: ${funnel.demo}`,
    `Proposal: ${funnel.proposal}`,
    `Close: ${funnel.close}`
  ].join('\n');
}

export default function ControlPlanePanel({
  history,
  catalog,
  salesCockpit,
  onSaveSalesCockpit,
  onOpenWorkspaceFile,
  onCopyToClipboard,
  onOpenExternal,
  variant = 'sidebar',
  activeModule = 'offer',
  onSelectModule,
  onConnectProvider,
  onValidateProvider,
  onDisconnectProvider
}: ControlPlanePanelProps) {
  const [leadDraft, setLeadDraft] = useState<LeadDraft>(() => createLeadDraft());
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => createTaskDraft());

  const dashboardModel = useMemo(() => {
    if (!catalog) return null;
    return buildControlPlaneDashboardModel(history, catalog);
  }, [catalog, history]);

  const salesModel = useMemo(() => buildSalesCockpitModel(salesCockpit), [salesCockpit]);
  const templateMap = useMemo(() => new Map(salesCockpit.templates.map((template) => [template.id, template])), [salesCockpit.templates]);
  const providerDefinitionMap = useMemo(() => new Map(SALES_PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider])), []);

  if (!dashboardModel || !catalog) {
    return (
      <div style={{ padding: '14px 12px', opacity: 0.75, fontSize: '12px' }}>
        Control plane catalog is not available in this webview session.
      </div>
    );
  }

  const updateCockpit = (next: SalesCockpitState) => onSaveSalesCockpit(next);

  const updateNotes = (notes: string) => {
    updateCockpit({ ...salesCockpit, notes });
  };

  const updateOfferField = (field: keyof SalesCockpitOffer, value: string) => {
    updateCockpit({
      ...salesCockpit,
      offer: {
        ...salesCockpit.offer,
        [field]: value
      }
    });
  };

  const updateFunnelField = (field: keyof SalesCockpitFunnel, value: string) => {
    updateCockpit({
      ...salesCockpit,
      funnel: {
        ...salesCockpit.funnel,
        [field]: value
      }
    });
  };

  const updateTarget = (key: 'outbound' | 'discovery' | 'demos' | 'proposals', value: string) => {
    const parsed = Math.max(0, Number(value || 0));
    updateCockpit({
      ...salesCockpit,
      weeklyTargets: {
        ...salesCockpit.weeklyTargets,
        [key]: Number.isFinite(parsed) ? parsed : salesCockpit.weeklyTargets[key]
      }
    });
  };

  const addLead = () => {
    const company = leadDraft.company.trim();
    if (!company) return;
    const idBase = leadDraft.contactName.trim() ? `${company}-${leadDraft.contactName}` : company;
    updateCockpit({
      ...salesCockpit,
      leads: [
        ...salesCockpit.leads,
        {
          id: slugify(idBase),
          company,
          contactName: leadDraft.contactName.trim(),
          role: leadDraft.role.trim(),
          status: 'target',
          pain: leadDraft.pain.trim(),
          nextAction: leadDraft.nextAction.trim(),
          owner: 'founder',
          dueDate: leadDraft.dueDate || undefined,
          profileUrl: leadDraft.profileUrl.trim() || undefined
        }
      ]
    });
    setLeadDraft(createLeadDraft());
  };

  const updateLead = (leadId: string, patch: Partial<SalesCockpitLead>) => {
    updateCockpit({
      ...salesCockpit,
      leads: salesCockpit.leads.map((lead) => lead.id === leadId ? mergeLeadPatch(lead, patch) : lead)
    });
  };

  const removeLead = (leadId: string) => {
    updateCockpit({
      ...salesCockpit,
      leads: salesCockpit.leads.filter((lead) => lead.id !== leadId),
      tasks: salesCockpit.tasks.map((task) => task.leadId === leadId ? { ...task, leadId: undefined } : task)
    });
  };

  const addTask = () => {
    const title = taskDraft.title.trim();
    if (!title) return;
    updateCockpit({
      ...salesCockpit,
      tasks: [
        ...salesCockpit.tasks,
        {
          id: slugify(`${taskDraft.kind}-${title}`),
          title,
          status: 'todo',
          kind: taskDraft.kind,
          owner: 'founder',
          dueDate: taskDraft.dueDate || undefined,
          leadId: taskDraft.leadId || undefined
        }
      ]
    });
    setTaskDraft(createTaskDraft());
  };

  const updateTask = (taskId: string, patch: { title?: string; kind?: SalesTaskKind; dueDate?: string }) => {
    updateCockpit({
      ...salesCockpit,
      tasks: salesCockpit.tasks.map((task) => task.id === taskId ? {
        ...task,
        ...patch,
        dueDate: patch.dueDate === '' ? undefined : patch.dueDate ?? task.dueDate
      } : task)
    });
  };

  const toggleTask = (taskId: string) => {
    updateCockpit({
      ...salesCockpit,
      tasks: salesCockpit.tasks.map((task) => task.id === taskId ? {
        ...task,
        status: 'done'
      } : task)
    });
  };

  const resetTask = (taskId: string) => {
    updateCockpit({
      ...salesCockpit,
      tasks: salesCockpit.tasks.map((task) => task.id === taskId ? {
        ...task,
        status: 'todo'
      } : task)
    });
  };

  const removeTask = (taskId: string) => {
    updateCockpit({
      ...salesCockpit,
      tasks: salesCockpit.tasks.filter((task) => task.id !== taskId)
    });
  };

  const toggleCampaign = (campaignId: string) => {
    updateCockpit({
      ...salesCockpit,
      campaigns: salesCockpit.campaigns.map((campaign) => campaign.id === campaignId ? {
        ...campaign,
        active: !campaign.active
      } : campaign)
    });
  };

  const copyTemplate = (templateId: string, lead?: SalesCockpitLead) => {
    const template = templateMap.get(templateId);
    if (!template) return;
    const rendered = renderSalesTemplate(template, lead);
    const payload = rendered.subject ? `Subject: ${rendered.subject}\n\n${rendered.body}` : rendered.body;
    onCopyToClipboard(payload);
  };

  const updateProvider = (providerId: string, patch: Partial<SalesProviderAccount>) => {
    updateCockpit({
      ...salesCockpit,
      providerAccounts: salesCockpit.providerAccounts.map((provider) => provider.id === providerId ? {
        ...provider,
        ...patch,
        accountRef: patch.accountRef === '' ? '' : patch.accountRef ?? provider.accountRef,
        endpointUrl: patch.endpointUrl === '' ? '' : patch.endpointUrl ?? provider.endpointUrl,
        notes: patch.notes === '' ? '' : patch.notes ?? provider.notes
      } : provider)
    });
  };

  const buildProviderBrief = (provider: SalesProviderAccount): string => {
    const definition = providerDefinitionMap.get(provider.provider);
    return [
      definition?.title || provider.label,
      '',
      `Status: ${formatStageLabel(provider.status)}`,
      `Mode: ${formatStageLabel(provider.mode)}`,
      `Account: ${provider.accountRef || 'not set'}`,
      `Endpoint: ${provider.endpointUrl || 'not set'}`,
      `Capabilities: ${(provider.capabilities || []).join(', ') || 'none'}`,
      `Notes: ${provider.notes || 'none'}`
    ].join('\n');
  };

  const statCards = [
    { label: 'Runs', value: String(dashboardModel.stats.totalRuns) },
    { label: 'Success', value: `${dashboardModel.stats.successRate}%` },
    { label: 'Failures', value: String(dashboardModel.stats.failures) },
    { label: 'PRs', value: String(dashboardModel.stats.pullRequests) },
    { label: 'Approvals', value: String(dashboardModel.stats.approvals) }
  ];

  const defaultFlags = [
    { label: 'Open core', value: dashboardModel.defaults.openCore ? 'Yes' : 'No' },
    { label: 'Seat pricing', value: dashboardModel.defaults.seatBasedPricing ? 'Yes' : 'No' },
    { label: 'Bundled LLM cost', value: dashboardModel.defaults.absorbLlmCost ? 'Yes' : 'No' }
  ];

  const quickLinks = [
    { key: 'salesPlaybook', label: 'Sales playbook', path: catalog.docs.salesPlaybook },
    { key: 'pricing', label: 'Pricing', path: catalog.docs.pricing },
    { key: 'foundingPilot', label: 'Pilot scope', path: catalog.docs.foundingPilot },
    { key: 'proofScript', label: 'Demo script', path: catalog.docs.proofScript },
    { key: 'landingPage', label: 'Landing page', path: catalog.docs.landingPage },
    { key: 'outboundPlan', label: 'Outbound plan', path: 'docs/sales/leion-delivery-outbound-plan.md' }
  ];

  const renderOverviewSection = () => (
    <section key="overview" style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>Sales Cockpit</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}>{catalog.controlPlaneName}</div>
        </div>
        <span style={{ fontSize: '11px', padding: '6px 8px', borderRadius: '999px', background: 'rgba(14, 99, 156, 0.2)', color: '#9ad4ff' }}>
          founder-led
        </span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: 1.55, opacity: 0.88 }}>{catalog.positioning}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
        {defaultFlags.map((flag) => (
          <span key={flag.label} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            {flag.label}: {flag.value}
          </span>
        ))}
      </div>
      <textarea
        className="nodrag"
        value={salesCockpit.notes}
        onChange={(event) => updateNotes(event.target.value)}
        placeholder="Operating notes, objections, or weekly focus..."
        style={{ ...textareaStyle, marginTop: '10px', minHeight: '84px' }}
      />
    </section>
  );

  const renderOfferBuilderSection = () => (
    <section key="offerBuilder" style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>Offer Builder</div>
        <button type="button" className="nodrag cp-btn-secondary" onClick={() => onCopyToClipboard(buildOfferBrief(salesCockpit.offer))} style={buttonStyle}>
          Copy offer brief
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
        <input className="nodrag" value={salesCockpit.offer.name} onChange={(event) => updateOfferField('name', event.target.value)} placeholder="Product name" style={inputStyle} />
        <textarea className="nodrag" value={salesCockpit.offer.audience} onChange={(event) => updateOfferField('audience', event.target.value)} placeholder="Who this offer is for" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.offer.problem} onChange={(event) => updateOfferField('problem', event.target.value)} placeholder="Buyer problem" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.offer.promise} onChange={(event) => updateOfferField('promise', event.target.value)} placeholder="Transformation or promise" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.offer.proof} onChange={(event) => updateOfferField('proof', event.target.value)} placeholder="Proof and demo angle" style={{ ...textareaStyle, minHeight: '54px' }} />
        <input className="nodrag" value={salesCockpit.offer.callToAction} onChange={(event) => updateOfferField('callToAction', event.target.value)} placeholder="Call to action" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenWorkspaceFile(catalog.docs.pricing)} style={buttonStyle}>Open pricing</button>
        <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenWorkspaceFile(catalog.docs.foundingPilot)} style={buttonStyle}>Open pilot</button>
        <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenWorkspaceFile(catalog.docs.salesPlaybook)} style={buttonStyle}>Open sales playbook</button>
      </div>
    </section>
  );

  const renderMetricsSection = () => (
    <section key="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
      {salesModel.metrics.map((metric) => (
        <div key={metric.key} className="cp-card-hover" style={{ ...cardStyle, background: 'rgba(255,255,255,0.025)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ fontSize: '11px', opacity: 0.72 }}>{metric.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{metric.current}</div>
          </div>
          <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Target this week</div>
          <input className="nodrag" type="number" min={0} value={salesCockpit.weeklyTargets[metric.key]} onChange={(event) => updateTarget(metric.key, event.target.value)} style={{ ...inputStyle, marginTop: '6px', padding: '6px 8px' }} />
        </div>
      ))}
    </section>
  );

  const renderFunnelSection = () => (
    <section key="funnel" style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>Sales Funnel Builder</div>
        <button type="button" className="nodrag cp-btn-secondary" onClick={() => onCopyToClipboard(buildFunnelBrief(salesCockpit.funnel))} style={buttonStyle}>
          Copy funnel brief
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
        <textarea className="nodrag" value={salesCockpit.funnel.acquisition} onChange={(event) => updateFunnelField('acquisition', event.target.value)} placeholder="How leads enter the funnel" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.funnel.qualification} onChange={(event) => updateFunnelField('qualification', event.target.value)} placeholder="Qualification gate" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.funnel.demo} onChange={(event) => updateFunnelField('demo', event.target.value)} placeholder="Demo motion" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.funnel.proposal} onChange={(event) => updateFunnelField('proposal', event.target.value)} placeholder="Proposal motion" style={{ ...textareaStyle, minHeight: '54px' }} />
        <textarea className="nodrag" value={salesCockpit.funnel.close} onChange={(event) => updateFunnelField('close', event.target.value)} placeholder="Close / expansion motion" style={{ ...textareaStyle, minHeight: '54px' }} />
      </div>
    </section>
  );

  const renderLeadPipelineSection = () => (
    <section key="leadPipeline" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Lead pipeline</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {SALES_LEAD_STAGES.map((stage) => (
          <span key={stage} style={{ fontSize: '11px', padding: '5px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            {formatStageLabel(stage)}: {salesModel.stageCounts[stage]}
          </span>
        ))}
      </div>
      <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '11px' }}>
        <div className="cp-card-hover" style={cardStyle}>
          <div style={{ opacity: 0.72 }}>Open leads</div>
          <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '6px' }}>{salesModel.openLeads.length}</div>
        </div>
        <div className="cp-card-hover" style={cardStyle}>
          <div style={{ opacity: 0.72 }}>Overdue tasks</div>
          <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '6px' }}>{salesModel.overdueTasks}</div>
        </div>
      </div>
    </section>
  );

  const renderActionQueueSection = () => (
    <section key="actionQueue" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Action queue</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {salesCockpit.tasks.map((task) => (
          <div key={task.id} className="cp-card-hover" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => task.status === 'done' ? resetTask(task.id) : toggleTask(task.id)} style={{ ...buttonStyle, width: '34px', padding: '6px 0', background: task.status === 'done' ? 'rgba(76, 175, 80, 0.18)' : 'rgba(255,255,255,0.04)' }}>
                {task.status === 'done' ? '✓' : '○'}
              </button>
              <input
                className="nodrag"
                defaultValue={task.title}
                onBlur={(event) => {
                  const nextValue = event.target.value.trim();
                  if (!nextValue) {
                    event.target.value = task.title;
                    return;
                  }
                  updateTask(task.id, { title: nextValue });
                }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => removeTask(task.id)} style={buttonStyle}>Del</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              <select className="nodrag" value={task.kind} onChange={(event) => updateTask(task.id, { kind: event.target.value as SalesTaskKind })} style={inputStyle}>
                {SALES_TASK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{formatStageLabel(kind)}</option>
                ))}
              </select>
              <input className="nodrag" type="date" value={task.dueDate || ''} onChange={(event) => updateTask(task.id, { dueDate: event.target.value })} style={inputStyle} />
            </div>
          </div>
        ))}
      </div>
      <div className="cp-card-hover" style={{ ...cardStyle, marginTop: '10px', background: 'rgba(14, 99, 156, 0.12)' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Add task</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
          <input className="nodrag" value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Send pilot scope to agency CTO" style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <select className="nodrag" value={taskDraft.kind} onChange={(event) => setTaskDraft((current) => ({ ...current, kind: event.target.value as SalesTaskKind }))} style={inputStyle}>
              {SALES_TASK_KINDS.map((kind) => (
                <option key={kind} value={kind}>{formatStageLabel(kind)}</option>
              ))}
            </select>
            <input className="nodrag" type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))} style={inputStyle} />
          </div>
          <select className="nodrag" value={taskDraft.leadId} onChange={(event) => setTaskDraft((current) => ({ ...current, leadId: event.target.value }))} style={inputStyle}>
            <option value="">No lead linked</option>
            {salesCockpit.leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.company}</option>
            ))}
          </select>
          <button type="button" className="nodrag cp-btn-primary" onClick={addTask}>Add task</button>
        </div>
      </div>
    </section>
  );

  const renderProspectsSection = () => (
    <section key="prospects" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Prospects</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {salesModel.openLeads.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: '11px' }}>No prospects yet. Start by adding your first target account below.</div>
        )}
        {salesModel.openLeads.map((lead) => (
          <div key={lead.id} className="cp-card-hover" style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <input
                className="nodrag"
                defaultValue={lead.company}
                onBlur={(event) => {
                  const nextValue = event.target.value.trim();
                  if (!nextValue) {
                    event.target.value = lead.company;
                    return;
                  }
                  updateLead(lead.id, { company: nextValue });
                }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <select className="nodrag" value={lead.status} onChange={(event) => updateLead(lead.id, { status: event.target.value as SalesCockpitLead['status'] })} style={{ ...inputStyle, width: '132px' }}>
                {SALES_LEAD_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{formatStageLabel(stage)}</option>
                ))}
              </select>
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => removeLead(lead.id)} style={buttonStyle}>Del</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input className="nodrag" value={lead.contactName} onChange={(event) => updateLead(lead.id, { contactName: event.target.value })} placeholder="Contact" style={inputStyle} />
              <input className="nodrag" value={lead.role} onChange={(event) => updateLead(lead.id, { role: event.target.value })} placeholder="Role" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              <input className="nodrag" type="date" value={lead.dueDate || ''} onChange={(event) => updateLead(lead.id, { dueDate: event.target.value })} style={inputStyle} />
              <input className="nodrag" value={lead.profileUrl || ''} onChange={(event) => updateLead(lead.id, { profileUrl: event.target.value })} placeholder="https://linkedin.com/..." style={inputStyle} />
            </div>
            <textarea className="nodrag" value={lead.pain} onChange={(event) => updateLead(lead.id, { pain: event.target.value })} placeholder="Why this account is a fit" style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }} />
            <input className="nodrag" value={lead.nextAction} onChange={(event) => updateLead(lead.id, { nextAction: event.target.value })} placeholder="Next explicit action" style={{ ...inputStyle, marginTop: '8px' }} />
            <textarea className="nodrag" value={lead.notes || ''} onChange={(event) => updateLead(lead.id, { notes: event.target.value })} placeholder="Objections, context, or call notes" style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => copyTemplate('tpl-founder-email', lead)} style={buttonStyle}>Copy email</button>
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => copyTemplate('tpl-linkedin-followup', lead)} style={buttonStyle}>Copy LinkedIn</button>
              {!!lead.profileUrl && (
                <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenExternal(lead.profileUrl!)} style={buttonStyle}>Open profile</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="cp-card-hover" style={{ ...cardStyle, marginTop: '10px', background: 'rgba(14, 99, 156, 0.12)' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Add lead</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <input className="nodrag" value={leadDraft.company} onChange={(event) => setLeadDraft((current) => ({ ...current, company: event.target.value }))} placeholder="Company" style={inputStyle} />
          <input className="nodrag" value={leadDraft.contactName} onChange={(event) => setLeadDraft((current) => ({ ...current, contactName: event.target.value }))} placeholder="Contact name" style={inputStyle} />
          <input className="nodrag" value={leadDraft.role} onChange={(event) => setLeadDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Role" style={inputStyle} />
          <input className="nodrag" type="date" value={leadDraft.dueDate} onChange={(event) => setLeadDraft((current) => ({ ...current, dueDate: event.target.value }))} style={inputStyle} />
        </div>
        <input className="nodrag" value={leadDraft.profileUrl} onChange={(event) => setLeadDraft((current) => ({ ...current, profileUrl: event.target.value }))} placeholder="Profile URL" style={{ ...inputStyle, marginTop: '8px' }} />
        <textarea className="nodrag" value={leadDraft.pain} onChange={(event) => setLeadDraft((current) => ({ ...current, pain: event.target.value }))} placeholder="Why this account fits the offer" style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }} />
        <input className="nodrag" value={leadDraft.nextAction} onChange={(event) => setLeadDraft((current) => ({ ...current, nextAction: event.target.value }))} placeholder="Next action" style={{ ...inputStyle, marginTop: '8px' }} />
        <button type="button" className="nodrag cp-btn-primary" onClick={addLead} style={{ marginTop: '8px', width: '100%' }}>Add lead</button>
      </div>
    </section>
  );

  const renderCampaignSection = () => (
    <section key="campaigns" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Campaigns and templates</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {salesCockpit.campaigns.map((campaign) => {
          const template = templateMap.get(campaign.templateId);
          return (
            <div key={campaign.id} className="cp-card-hover" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>{campaign.name}</div>
                  <div style={{ fontSize: '11px', opacity: 0.72, marginTop: '4px' }}>{campaign.goal}</div>
                </div>
                <button type="button" className="nodrag cp-btn-secondary" onClick={() => toggleCampaign(campaign.id)} style={buttonStyle}>
                  {campaign.active ? 'Active' : 'Paused'}
                </button>
              </div>
              {template && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', opacity: 0.72 }}>{template.channel.toUpperCase()} template</div>
                  <div style={{ fontSize: '11px', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: 1.5, opacity: 0.9 }}>
                    {template.subject ? `Subject: ${template.subject}\n\n` : ''}{template.body}
                  </div>
                  <button type="button" className="nodrag cp-btn-secondary" onClick={() => copyTemplate(template.id)} style={{ ...buttonStyle, marginTop: '8px' }}>
                    Copy template
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '10px', fontSize: '11px', opacity: 0.78 }}>
        Active campaigns: {salesModel.activeCampaigns.length} / {salesCockpit.campaigns.length}
      </div>
    </section>
  );

  const renderProvidersSection = () => (
    <section key="providers" style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>Accounts & providers</div>
          <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
            Connect surfaces deliberately. Draft and hand off first, automate later.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            Connected: {salesModel.providerSummary.connected}
          </span>
          <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            Configured: {salesModel.providerSummary.configured}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {salesCockpit.providerAccounts.map((provider) => {
          const definition = providerDefinitionMap.get(provider.provider);
          const canManage = variant === 'cockpit' && !!onConnectProvider && !!onValidateProvider && !!onDisconnectProvider;
          return (
            <div key={provider.id} className="cp-card-hover" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{definition?.title || provider.label}</div>
                  <div style={{ fontSize: '11px', opacity: 0.72, marginTop: '4px' }}>{definition?.description || provider.label}</div>
                </div>
                <span style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  background: provider.status === 'connected' ? 'rgba(76, 175, 80, 0.18)' : provider.status === 'configured' ? 'rgba(242, 201, 76, 0.18)' : 'rgba(255,255,255,0.05)',
                  color: provider.status === 'connected' ? '#b8f7c5' : provider.status === 'configured' ? '#ffe3a1' : '#d0d5dd'
                }}>
                  {formatStageLabel(provider.status)}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {(provider.capabilities || []).map((capability) => (
                  <span key={`${provider.id}-${capability}`} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
                    {capability}
                  </span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                <input
                  className="nodrag"
                  value={provider.accountRef || ''}
                  onChange={(event) => updateProvider(provider.id, { accountRef: event.target.value })}
                  placeholder={definition?.accountRefPlaceholder || 'Account reference'}
                  style={inputStyle}
                />
                <input
                  className="nodrag"
                  value={provider.endpointUrl || ''}
                  onChange={(event) => updateProvider(provider.id, { endpointUrl: event.target.value })}
                  placeholder={definition?.endpointPlaceholder || 'Endpoint URL'}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <input
                  className="nodrag"
                  value={provider.label}
                  onChange={(event) => updateProvider(provider.id, { label: event.target.value })}
                  placeholder="Provider label"
                  style={inputStyle}
                />
                <select
                  className="nodrag"
                  value={provider.status}
                  onChange={(event) => updateProvider(provider.id, { status: event.target.value as SalesProviderStatus })}
                  style={inputStyle}
                >
                  {SALES_PROVIDER_STATUSES.map((status) => (
                    <option key={status} value={status}>{formatStageLabel(status)}</option>
                  ))}
                </select>
                <select
                  className="nodrag"
                  value={provider.mode}
                  onChange={(event) => updateProvider(provider.id, { mode: event.target.value as SalesProviderMode })}
                  style={inputStyle}
                >
                  {SALES_PROVIDER_MODES.map((mode) => (
                    <option key={mode} value={mode}>{formatStageLabel(mode)}</option>
                  ))}
                </select>
              </div>
              <textarea
                className="nodrag"
                value={provider.notes || ''}
                onChange={(event) => updateProvider(provider.id, { notes: event.target.value })}
                placeholder={`Notes for ${definition?.title || provider.label}`}
                style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="nodrag cp-btn-secondary" onClick={() => onCopyToClipboard(buildProviderBrief(provider))} style={buttonStyle}>
                  Copy provider brief
                </button>
                {canManage && (
                  <button type="button" className="nodrag cp-btn-secondary" onClick={() => onConnectProvider?.(provider.id)} style={buttonStyle}>
                    {provider.status === 'not_connected' ? 'Connect' : 'Reconnect'}
                  </button>
                )}
                {canManage && (
                  <button type="button" className="nodrag cp-btn-secondary" onClick={() => onValidateProvider?.(provider.id)} style={buttonStyle}>
                    Validate
                  </button>
                )}
                {canManage && provider.status !== 'not_connected' && (
                  <button type="button" className="nodrag cp-btn-secondary" onClick={() => onDisconnectProvider?.(provider.id)} style={buttonStyle}>
                    Disconnect
                  </button>
                )}
                {!!provider.endpointUrl && (
                  <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenExternal(provider.endpointUrl!)} style={buttonStyle}>
                    Open endpoint
                  </button>
                )}
              </div>
              {canManage && (
                <div style={{ fontSize: '10px', opacity: 0.66, marginTop: '8px' }}>
                  Sensitive values are stored in VS Code Secret Storage. The cockpit keeps only the visible metadata.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderDeliverySection = () => (
    <section key="delivery" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Delivery proof and deployer</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        {statCards.map((card) => (
          <div key={card.label} className="cp-card-hover" style={{ ...cardStyle, background: 'rgba(255,255,255,0.025)' }}>
            <div style={{ fontSize: '11px', opacity: 0.72 }}>{card.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '6px' }}>{card.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
        {dashboardModel.templates.map((template) => {
          const tone = statusTone(template.lastRunStatus);
          return (
            <div key={template.key} className="cp-card-hover" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{template.name}</div>
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>{template.proofGoal}</div>
                </div>
                <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '999px', color: tone.color, background: tone.background, border: `1px solid ${tone.border}`, fontWeight: 600 }}>
                  {tone.label}
                </span>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.82 }}>
                Last run: {template.lastRunName || 'No run yet'} · {formatTimestamp(template.lastRunTimestamp)}
              </div>
              <button type="button" className="nodrag cp-btn-secondary" onClick={() => onOpenWorkspaceFile(template.pipelinePath)} style={{ ...buttonStyle, marginTop: '8px', width: '100%' }}>
                Open pipeline
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
        {dashboardModel.plans.map((plan) => (
          <div key={plan.key} className="cp-card-hover" style={{ ...cardStyle, background: plan.key === 'founding_pilot' ? 'rgba(14, 99, 156, 0.14)' : 'rgba(0,0,0,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{plan.displayName}</div>
              <span style={{ fontSize: '11px', opacity: 0.75 }}>{plan.salesMotion}</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px' }}>{formatPrice(plan)}</div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderQuickAccessSection = () => (
    <section key="quickAccess" style={sectionStyle}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Quick access</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        {quickLinks.map((entry) => (
          <button key={entry.key} type="button" className="nodrag" onClick={() => onOpenWorkspaceFile(entry.path)} style={buttonStyle}>
            {entry.label}
          </button>
        ))}
      </div>
    </section>
  );

  const renderCockpitModuleBar = () => (
    <section
      key="cockpitModuleBar"
      style={{
        ...sectionStyle,
        position: 'sticky',
        top: 0,
        zIndex: 3,
        background: 'rgba(7, 9, 13, 0.94)',
        backdropFilter: 'blur(18px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.64 }}>
            {CONTROL_PLANE_MODULES.find((module) => module.id === activeModule)?.kicker || 'Cockpit'}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, marginTop: '4px' }}>
            {CONTROL_PLANE_MODULES.find((module) => module.id === activeModule)?.title || 'Cockpit'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.78, marginTop: '4px', maxWidth: '680px' }}>
            {CONTROL_PLANE_MODULES.find((module) => module.id === activeModule)?.description || ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            Providers: {salesModel.providerSummary.connected + salesModel.providerSummary.configured}/{salesModel.providerSummary.total}
          </span>
          <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
            Open leads: {salesModel.openLeads.length}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {CONTROL_PLANE_MODULES.map((module) => {
          const selected = module.id === activeModule;
          return (
            <button
              key={`top-${module.id}`}
              type="button"
              className="nodrag"
              onClick={() => onSelectModule?.(module.id)}
              disabled={!onSelectModule}
              style={{
                ...buttonStyle,
                background: selected ? 'rgba(0, 162, 255, 0.14)' : 'rgba(255,255,255,0.04)',
                borderColor: selected ? 'rgba(0, 162, 255, 0.45)' : 'rgba(255,255,255,0.08)',
                color: selected ? '#9ad4ff' : 'var(--vscode-button-secondaryForeground)',
                opacity: onSelectModule ? 1 : 0.7
              }}
            >
              {module.title}
            </button>
          );
        })}
      </div>
    </section>
  );

  const sections: React.ReactNode[] = [];

  if (variant === 'sidebar') {
    sections.push(
      renderOverviewSection(),
      renderMetricsSection(),
      renderLeadPipelineSection(),
      renderActionQueueSection(),
      renderProspectsSection(),
      renderProvidersSection(),
      renderCampaignSection(),
      renderDeliverySection(),
      renderQuickAccessSection()
    );
  } else if (activeModule === 'offer') {
    sections.push(renderCockpitModuleBar(), renderOverviewSection(), renderOfferBuilderSection());
  } else if (activeModule === 'prospects') {
    sections.push(renderCockpitModuleBar(), renderLeadPipelineSection(), renderProspectsSection());
  } else if (activeModule === 'contact') {
    sections.push(renderCockpitModuleBar(), renderCampaignSection());
  } else if (activeModule === 'funnel') {
    sections.push(renderCockpitModuleBar(), renderMetricsSection(), renderFunnelSection(), renderLeadPipelineSection());
  } else if (activeModule === 'deploy') {
    sections.push(renderCockpitModuleBar(), renderDeliverySection(), renderQuickAccessSection());
  } else if (activeModule === 'follow_up') {
    sections.push(renderCockpitModuleBar(), renderActionQueueSection(), renderLeadPipelineSection(), renderDeliverySection());
  } else if (activeModule === 'settings') {
    sections.push(renderCockpitModuleBar(), renderProvidersSection(), renderQuickAccessSection());
  }

  return (
    <div style={{ padding: variant === 'cockpit' ? '14px' : '10px 8px 14px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      {sections}
    </div>
  );
}

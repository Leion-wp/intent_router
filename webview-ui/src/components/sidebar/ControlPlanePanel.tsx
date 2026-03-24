import React, { useMemo, useState } from 'react';
import { PipelineRun } from '../../types/messages';
import { buildControlPlaneDashboardModel, DeliveryCatalogRecord } from '../../utils/controlPlaneDashboardUtils';
import {
  buildSalesCockpitModel,
  renderSalesTemplate,
  SALES_LEAD_STAGES,
  SALES_TASK_KINDS,
  SalesCockpitLead,
  SalesCockpitState,
  SalesTaskKind,
  slugify
} from '../../utils/salesCockpitUtils';

type ControlPlanePanelProps = {
  history: PipelineRun[];
  catalog: DeliveryCatalogRecord | null;
  salesCockpit: SalesCockpitState;
  onSaveSalesCockpit: (next: SalesCockpitState) => void;
  onOpenWorkspaceFile: (path: string) => void;
  onCopyToClipboard: (text: string) => void;
  onOpenExternal: (url: string) => void;
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
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '12px',
  background: 'rgba(255,255,255,0.03)'
};

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  padding: '10px',
  background: 'rgba(0,0,0,0.14)'
};

const buttonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--vscode-button-secondaryForeground)',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--vscode-editor-foreground)',
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

function statusTone(status: string): { label: string; color: string; background: string } {
  if (status === 'success') return { label: 'Success', color: '#b8f7c5', background: 'rgba(76, 175, 80, 0.18)' };
  if (status === 'failure') return { label: 'Failure', color: '#ffc6c6', background: 'rgba(244, 67, 54, 0.18)' };
  if (status === 'running') return { label: 'Running', color: '#ffe3a1', background: 'rgba(242, 201, 76, 0.18)' };
  if (status === 'cancelled') return { label: 'Cancelled', color: '#d0d5dd', background: 'rgba(148, 163, 184, 0.18)' };
  return { label: 'Not run', color: '#9ad4ff', background: 'rgba(14, 99, 156, 0.18)' };
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

export default function ControlPlanePanel({
  history,
  catalog,
  salesCockpit,
  onSaveSalesCockpit,
  onOpenWorkspaceFile,
  onCopyToClipboard,
  onOpenExternal
}: ControlPlanePanelProps) {
  const [leadDraft, setLeadDraft] = useState<LeadDraft>(() => createLeadDraft());
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => createTaskDraft());

  const dashboardModel = useMemo(() => {
    if (!catalog) return null;
    return buildControlPlaneDashboardModel(history, catalog);
  }, [catalog, history]);

  const salesModel = useMemo(() => buildSalesCockpitModel(salesCockpit), [salesCockpit]);
  const templateMap = useMemo(() => new Map(salesCockpit.templates.map((template) => [template.id, template])), [salesCockpit.templates]);

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
        status: task.status === 'done' ? 'todo' : 'done'
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

  return (
    <div style={{ padding: '10px 8px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <section style={sectionStyle}>
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

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        {salesModel.metrics.map((metric) => (
          <div key={metric.key} style={{ ...cardStyle, background: 'rgba(255,255,255,0.025)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontSize: '11px', opacity: 0.72 }}>{metric.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{metric.current}</div>
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Target this week</div>
            <input
              className="nodrag"
              type="number"
              min={0}
              value={salesCockpit.weeklyTargets[metric.key]}
              onChange={(event) => updateTarget(metric.key, event.target.value)}
              style={{ ...inputStyle, marginTop: '6px', padding: '6px 8px' }}
            />
          </div>
        ))}
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Lead pipeline</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {SALES_LEAD_STAGES.map((stage) => (
            <span key={stage} style={{ fontSize: '11px', padding: '5px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.05)' }}>
              {formatStageLabel(stage)}: {salesModel.stageCounts[stage]}
            </span>
          ))}
        </div>
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '11px' }}>
          <div style={cardStyle}>
            <div style={{ opacity: 0.72 }}>Open leads</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '6px' }}>{salesModel.openLeads.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ opacity: 0.72 }}>Overdue tasks</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '6px' }}>{salesModel.overdueTasks}</div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Action queue</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {salesCockpit.tasks.map((task) => (
            <div key={task.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="nodrag"
                  onClick={() => toggleTask(task.id)}
                  style={{
                    ...buttonStyle,
                    width: '34px',
                    padding: '6px 0',
                    background: task.status === 'done' ? 'rgba(76, 175, 80, 0.18)' : 'rgba(255,255,255,0.04)'
                  }}
                >
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
                <button type="button" className="nodrag" onClick={() => removeTask(task.id)} style={buttonStyle}>Del</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <select
                  className="nodrag"
                  value={task.kind}
                  onChange={(event) => updateTask(task.id, { kind: event.target.value as SalesTaskKind })}
                  style={inputStyle}
                >
                  {SALES_TASK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{formatStageLabel(kind)}</option>
                  ))}
                </select>
                <input
                  className="nodrag"
                  type="date"
                  value={task.dueDate || ''}
                  onChange={(event) => updateTask(task.id, { dueDate: event.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...cardStyle, marginTop: '10px', background: 'rgba(14, 99, 156, 0.12)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Add task</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <input
              className="nodrag"
              value={taskDraft.title}
              onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Send pilot scope to agency CTO"
              style={inputStyle}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select
                className="nodrag"
                value={taskDraft.kind}
                onChange={(event) => setTaskDraft((current) => ({ ...current, kind: event.target.value as SalesTaskKind }))}
                style={inputStyle}
              >
                {SALES_TASK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{formatStageLabel(kind)}</option>
                ))}
              </select>
              <input
                className="nodrag"
                type="date"
                value={taskDraft.dueDate}
                onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))}
                style={inputStyle}
              />
            </div>
            <select
              className="nodrag"
              value={taskDraft.leadId}
              onChange={(event) => setTaskDraft((current) => ({ ...current, leadId: event.target.value }))}
              style={inputStyle}
            >
              <option value="">No lead linked</option>
              {salesCockpit.leads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.company}</option>
              ))}
            </select>
            <button type="button" className="nodrag" onClick={addTask} style={buttonStyle}>Add task</button>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Prospects</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {salesModel.openLeads.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: '11px' }}>No prospects yet. Start by adding your first target account below.</div>
          )}
          {salesModel.openLeads.map((lead) => (
            <div key={lead.id} style={cardStyle}>
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
                <select
                  className="nodrag"
                  value={lead.status}
                  onChange={(event) => updateLead(lead.id, { status: event.target.value as SalesCockpitLead['status'] })}
                  style={{ ...inputStyle, width: '132px' }}
                >
                  {SALES_LEAD_STAGES.map((stage) => (
                    <option key={stage} value={stage}>{formatStageLabel(stage)}</option>
                  ))}
                </select>
                <button type="button" className="nodrag" onClick={() => removeLead(lead.id)} style={buttonStyle}>Del</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  className="nodrag"
                  value={lead.contactName}
                  onChange={(event) => updateLead(lead.id, { contactName: event.target.value })}
                  placeholder="Contact"
                  style={inputStyle}
                />
                <input
                  className="nodrag"
                  value={lead.role}
                  onChange={(event) => updateLead(lead.id, { role: event.target.value })}
                  placeholder="Role"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <input
                  className="nodrag"
                  type="date"
                  value={lead.dueDate || ''}
                  onChange={(event) => updateLead(lead.id, { dueDate: event.target.value })}
                  style={inputStyle}
                />
                <input
                  className="nodrag"
                  value={lead.profileUrl || ''}
                  onChange={(event) => updateLead(lead.id, { profileUrl: event.target.value })}
                  placeholder="https://linkedin.com/..."
                  style={inputStyle}
                />
              </div>
              <textarea
                className="nodrag"
                value={lead.pain}
                onChange={(event) => updateLead(lead.id, { pain: event.target.value })}
                placeholder="Why this account is a fit"
                style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }}
              />
              <input
                className="nodrag"
                value={lead.nextAction}
                onChange={(event) => updateLead(lead.id, { nextAction: event.target.value })}
                placeholder="Next explicit action"
                style={{ ...inputStyle, marginTop: '8px' }}
              />
              <textarea
                className="nodrag"
                value={lead.notes || ''}
                onChange={(event) => updateLead(lead.id, { notes: event.target.value })}
                placeholder="Objections, context, or call notes"
                style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="nodrag" onClick={() => copyTemplate('tpl-founder-email', lead)} style={buttonStyle}>Copy email</button>
                <button type="button" className="nodrag" onClick={() => copyTemplate('tpl-linkedin-followup', lead)} style={buttonStyle}>Copy LinkedIn</button>
                {!!lead.profileUrl && (
                  <button type="button" className="nodrag" onClick={() => onOpenExternal(lead.profileUrl!)} style={buttonStyle}>Open profile</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...cardStyle, marginTop: '10px', background: 'rgba(14, 99, 156, 0.12)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Add lead</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <input
              className="nodrag"
              value={leadDraft.company}
              onChange={(event) => setLeadDraft((current) => ({ ...current, company: event.target.value }))}
              placeholder="Company"
              style={inputStyle}
            />
            <input
              className="nodrag"
              value={leadDraft.contactName}
              onChange={(event) => setLeadDraft((current) => ({ ...current, contactName: event.target.value }))}
              placeholder="Contact name"
              style={inputStyle}
            />
            <input
              className="nodrag"
              value={leadDraft.role}
              onChange={(event) => setLeadDraft((current) => ({ ...current, role: event.target.value }))}
              placeholder="Role"
              style={inputStyle}
            />
            <input
              className="nodrag"
              type="date"
              value={leadDraft.dueDate}
              onChange={(event) => setLeadDraft((current) => ({ ...current, dueDate: event.target.value }))}
              style={inputStyle}
            />
          </div>
          <input
            className="nodrag"
            value={leadDraft.profileUrl}
            onChange={(event) => setLeadDraft((current) => ({ ...current, profileUrl: event.target.value }))}
            placeholder="Profile URL"
            style={{ ...inputStyle, marginTop: '8px' }}
          />
          <textarea
            className="nodrag"
            value={leadDraft.pain}
            onChange={(event) => setLeadDraft((current) => ({ ...current, pain: event.target.value }))}
            placeholder="Why this account fits the offer"
            style={{ ...textareaStyle, marginTop: '8px', minHeight: '54px' }}
          />
          <input
            className="nodrag"
            value={leadDraft.nextAction}
            onChange={(event) => setLeadDraft((current) => ({ ...current, nextAction: event.target.value }))}
            placeholder="Next action"
            style={{ ...inputStyle, marginTop: '8px' }}
          />
          <button type="button" className="nodrag" onClick={addLead} style={{ ...buttonStyle, marginTop: '8px', width: '100%' }}>Add lead</button>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Campaigns and templates</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {salesCockpit.campaigns.map((campaign) => {
            const template = templateMap.get(campaign.templateId);
            return (
              <div key={campaign.id} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{campaign.name}</div>
                    <div style={{ fontSize: '11px', opacity: 0.72, marginTop: '4px' }}>{campaign.goal}</div>
                  </div>
                  <button type="button" className="nodrag" onClick={() => toggleCampaign(campaign.id)} style={buttonStyle}>
                    {campaign.active ? 'Active' : 'Paused'}
                  </button>
                </div>
                {template && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.72 }}>{template.channel.toUpperCase()} template</div>
                    <div style={{ fontSize: '11px', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: 1.5, opacity: 0.9 }}>
                      {template.subject ? `Subject: ${template.subject}\n\n` : ''}{template.body}
                    </div>
                    <button type="button" className="nodrag" onClick={() => copyTemplate(template.id)} style={{ ...buttonStyle, marginTop: '8px' }}>
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

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Delivery proof and plans</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          {statCards.map((card) => (
            <div key={card.label} style={{ ...cardStyle, background: 'rgba(255,255,255,0.025)' }}>
              <div style={{ fontSize: '11px', opacity: 0.72 }}>{card.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '6px' }}>{card.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          {dashboardModel.templates.map((template) => {
            const tone = statusTone(template.lastRunStatus);
            return (
              <div key={template.key} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{template.name}</div>
                    <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>{template.proofGoal}</div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', color: tone.color, background: tone.background }}>
                    {tone.label}
                  </span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.82 }}>
                  Last run: {template.lastRunName || 'No run yet'} · {formatTimestamp(template.lastRunTimestamp)}
                </div>
                <button type="button" className="nodrag" onClick={() => onOpenWorkspaceFile(template.pipelinePath)} style={{ ...buttonStyle, marginTop: '8px', width: '100%' }}>
                  Open pipeline
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          {dashboardModel.plans.map((plan) => (
            <div key={plan.key} style={{ ...cardStyle, background: plan.key === 'founding_pilot' ? 'rgba(14, 99, 156, 0.14)' : 'rgba(0,0,0,0.14)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{plan.displayName}</div>
                <span style={{ fontSize: '11px', opacity: 0.75 }}>{plan.salesMotion}</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px' }}>{formatPrice(plan)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Quick access</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          {quickLinks.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="nodrag"
              onClick={() => onOpenWorkspaceFile(entry.path)}
              style={buttonStyle}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

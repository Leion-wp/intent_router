import { PipelineRun } from '../types/messages';

export type DeliveryPlanRecord = {
  key: string;
  displayName: string;
  salesMotion: 'self_serve' | 'assisted' | 'sales_led';
  priceEur?: number;
  setupFeeEur?: number;
  billingInterval?: string;
  repoLimit: number | null;
  workflowLimit: number | null;
  bySeat: false;
  byoAiKeysRequired: boolean;
  features: string[];
};

export type DeliveryTemplateRecord = {
  key: string;
  name: string;
  pipelinePath: string;
  humanApprovalStepId: string;
  defaultTriggerModes: string[];
  proofGoal: string;
};

export type DeliveryCatalogRecord = {
  productKey: string;
  controlPlaneName: string;
  positioning: string;
  targetCustomers: string[];
  freeOffer: DeliveryPlanRecord;
  commercialModel: {
    openCore: true;
    seatBasedPricing: false;
    absorbLlmCost: false;
    foundingPilot: DeliveryPlanRecord;
    publicPlans: DeliveryPlanRecord[];
  };
  templates: DeliveryTemplateRecord[];
  docs: Record<string, string>;
};

export type DashboardStats = {
  totalRuns: number;
  successRate: number;
  failures: number;
  pullRequests: number;
  approvals: number;
};

export type DashboardTemplateStatus = {
  key: string;
  name: string;
  pipelinePath: string;
  proofGoal: string;
  triggerModes: string[];
  humanApprovalStepId: string;
  lastRunStatus: 'not_run' | PipelineRun['status'];
  lastRunName: string | null;
  lastRunTimestamp: number | null;
};

export type DashboardModel = {
  stats: DashboardStats;
  plans: DeliveryPlanRecord[];
  templates: DashboardTemplateStatus[];
  docs: Record<string, string>;
  defaults: {
    openCore: boolean;
    seatBasedPricing: boolean;
    absorbLlmCost: boolean;
  };
};

function getPipelineNameFromPath(pipelinePath: string): string {
  const normalized = String(pipelinePath || '').replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  return fileName.replace(/\.intent\.json$/i, '').trim().toLowerCase();
}

function findLatestRunForTemplate(history: PipelineRun[], template: DeliveryTemplateRecord): PipelineRun | undefined {
  const pipelineName = getPipelineNameFromPath(template.pipelinePath);
  const candidates = history.filter((run) => {
    const name = String(run?.name || '').trim().toLowerCase();
    return !!name && (name === pipelineName || name.includes(pipelineName) || pipelineName.includes(name));
  });
  return [...candidates].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0];
}

export function buildControlPlaneDashboardModel(history: PipelineRun[], catalog: DeliveryCatalogRecord): DashboardModel {
  const totalRuns = history.length;
  const successRuns = history.filter((run) => run.status === 'success').length;
  const failures = history.filter((run) => run.status === 'failure').length;
  const pullRequests = history.reduce((total, run) => total + (Array.isArray(run.pullRequests) ? run.pullRequests.length : 0), 0);
  const approvals = history.reduce((total, run) => total + (Array.isArray(run.audit?.hitl) ? run.audit!.hitl!.length : 0), 0);

  const templates = catalog.templates.map((template) => {
    const lastRun = findLatestRunForTemplate(history, template);
    return {
      key: template.key,
      name: template.name,
      pipelinePath: template.pipelinePath,
      proofGoal: template.proofGoal,
      triggerModes: template.defaultTriggerModes,
      humanApprovalStepId: template.humanApprovalStepId,
      lastRunStatus: lastRun?.status || 'not_run',
      lastRunName: lastRun?.name || null,
      lastRunTimestamp: typeof lastRun?.timestamp === 'number' ? lastRun.timestamp : null
    };
  });

  return {
    stats: {
      totalRuns,
      successRate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
      failures,
      pullRequests,
      approvals
    },
    plans: [catalog.freeOffer, catalog.commercialModel.foundingPilot, ...catalog.commercialModel.publicPlans],
    templates,
    docs: catalog.docs,
    defaults: {
      openCore: catalog.commercialModel.openCore,
      seatBasedPricing: catalog.commercialModel.seatBasedPricing,
      absorbLlmCost: catalog.commercialModel.absorbLlmCost
    }
  };
}

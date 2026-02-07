export type ExecutionStatus = 'running' | 'success' | 'failure';

export type PipelineRun = {
  id: string;
  name: string;
  timestamp: number;
  status: 'running' | 'success' | 'failure' | 'cancelled';
  steps: Array<any>;
  pipelineSnapshot?: any;
};

// Extension -> Webview
export type WebviewInboundMessage =
  | { type: 'executionStatus'; index?: number; stepId?: string; status: ExecutionStatus; intentId: string }
  | { type: 'stepLog'; runId: string; intentId: string; stepId?: string; text: string; stream: 'stdout' | 'stderr' }
  | { type: 'historyUpdate'; history: PipelineRun[] }
  | { type: 'environmentUpdate'; environment: Record<string, string> }
  | { type: 'customNodesUpdate'; nodes: Array<any> }
  | { type: 'customNodesExported'; scope: 'one' | 'all'; id?: string; json: string }
  | { type: 'customNodesImported'; imported: Array<any>; renames: Record<string, string>; total: number }
  | { type: 'customNodesImportError'; message: string }
  | { type: 'uiPresetUpdate'; uiPreset: any }
  | { type: 'adminModeUpdate'; adminMode: boolean }
  | { type: 'uiPresetExported'; json: string }
  | { type: 'loadPipeline'; pipeline: any }
  | { type: 'pathSelected'; id: string; argName: string; path: string }
  | { type: 'optionsFetched'; argName: string; options: string[] }
  | { type: 'error'; message: string };

// Webview -> Extension
export type WebviewOutboundMessage =
  | { type: 'savePipeline'; pipeline: any; silent?: boolean }
  | { type: 'runPipeline'; pipeline: any; dryRun?: boolean }
  | { type: 'saveEnvironment'; environment: Record<string, string> }
  | { type: 'clearHistory' }
  | { type: 'customNodes.upsert'; node: any }
  | { type: 'customNodes.delete'; id: string }
  | { type: 'customNodes.export'; scope: 'one' | 'all'; id?: string }
  | { type: 'customNodes.import'; source: 'file' | 'paste'; jsonText?: string }
  | { type: 'uiPreset.saveDraft'; uiPreset: any }
  | { type: 'uiPreset.resetDraft' }
  | { type: 'uiPreset.exportCurrent' }
  | { type: 'uiPreset.importDraft'; jsonText: string }
  | { type: 'devPackager.loadPreset' }
  | { type: 'selectPath'; id: string; argName: string }
  | { type: 'fetchOptions'; command: string; argName: string };

export function isInboundMessage(value: any): value is WebviewInboundMessage {
  return !!value && typeof value === 'object' && typeof value.type === 'string';
}

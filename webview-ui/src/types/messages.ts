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
  | { type: 'pathSelected'; id: string; argName: string; path: string }
  | { type: 'optionsFetched'; argName: string; options: string[] }
  | { type: 'error'; message: string };

// Webview -> Extension
export type WebviewOutboundMessage =
  | { type: 'savePipeline'; pipeline: any }
  | { type: 'saveEnvironment'; environment: Record<string, string> }
  | { type: 'clearHistory' }
  | { type: 'selectPath'; id: string; argName: string }
  | { type: 'fetchOptions'; command: string; argName: string };

export function isInboundMessage(value: any): value is WebviewInboundMessage {
  return !!value && typeof value === 'object' && typeof value.type === 'string';
}

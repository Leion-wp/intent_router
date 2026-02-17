export type QuickAddNodeType =
  | 'promptNode'
  | 'repoNode'
  | 'actionNode'
  | 'vscodeCommandNode'
  | 'customNode'
  | 'formNode'
  | 'switchNode'
  | 'scriptNode'
  | 'agentNode'
  | 'teamNode'
  | 'approvalNode'
  | 'httpNode';

export type QuickAddCategory = 'context' | 'providers' | 'custom' | 'ai';

export type QuickAddItem = {
  id: string;
  label: string;
  nodeType: QuickAddNodeType;
  category: QuickAddCategory;
  provider?: string;
  capability?: string;
  customNodeId?: string;
};

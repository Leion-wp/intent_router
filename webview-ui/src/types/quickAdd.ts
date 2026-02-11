export type QuickAddNodeType =
  | 'promptNode'
  | 'repoNode'
  | 'actionNode'
  | 'vscodeCommandNode'
  | 'customNode'
  | 'formNode'
  | 'switchNode'
  | 'scriptNode';

export type QuickAddCategory = 'context' | 'providers' | 'custom';

export type QuickAddItem = {
  id: string;
  label: string;
  nodeType: QuickAddNodeType;
  category: QuickAddCategory;
  provider?: string;
  capability?: string;
  customNodeId?: string;
};

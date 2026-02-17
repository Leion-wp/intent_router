import { useMemo } from 'react';
import { UiPreset } from '../types/theme';
import { QuickAddItem } from '../types/quickAdd';

type UseQuickAddCatalogOptions = {
  commandGroups: any[];
  customNodes: any[];
  uiPreset: UiPreset;
  quickAddQuery: string;
  dockQuery: string;
  quickAddAnchor: { x: number; y: number } | null;
  getDefaultCapability: (providerName: string) => string;
};

function filterQuickAdd(items: QuickAddItem[], query: string) {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.label.toLowerCase().includes(normalized));
}

function groupQuickAddItems(items: QuickAddItem[]) {
  const groups = new Map<string, QuickAddItem[]>();
  for (const item of items) {
    const key = item.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

export function useQuickAddCatalog(options: UseQuickAddCatalogOptions) {
  const {
    commandGroups,
    customNodes,
    uiPreset,
    quickAddQuery,
    dockQuery,
    quickAddAnchor,
    getDefaultCapability
  } = options;

  const presetItems: QuickAddItem[] = useMemo(() => ([
    { id: 'preset-agent', label: 'AI Agent', nodeType: 'agentNode', category: 'ai' },
    { id: 'preset-team', label: 'AI Team', nodeType: 'teamNode', category: 'ai' },
    { id: 'preset-approval', label: 'Diff Approval', nodeType: 'approvalNode', category: 'context' },
    { id: 'preset-http', label: 'HTTP Request', nodeType: 'httpNode', category: 'providers' },
    { id: 'preset-prompt', label: 'Prompt', nodeType: 'promptNode', category: 'context' },
    { id: 'preset-form', label: 'Form', nodeType: 'formNode', category: 'context' },
    { id: 'preset-switch', label: 'Switch', nodeType: 'switchNode', category: 'context' },
    { id: 'preset-script', label: 'Script', nodeType: 'scriptNode', category: 'context' },
    { id: 'preset-repo', label: 'Repo', nodeType: 'repoNode', category: 'context' },
    { id: 'preset-terminal', label: 'Terminal', nodeType: 'actionNode', category: 'providers', provider: 'terminal', capability: getDefaultCapability('terminal') },
    { id: 'preset-system', label: 'System', nodeType: 'actionNode', category: 'providers', provider: 'system', capability: getDefaultCapability('system') },
    { id: 'preset-git', label: 'Git', nodeType: 'actionNode', category: 'providers', provider: 'git', capability: getDefaultCapability('git') },
    { id: 'preset-docker', label: 'Docker', nodeType: 'actionNode', category: 'providers', provider: 'docker', capability: getDefaultCapability('docker') },
    { id: 'preset-vscode', label: 'VS Code', nodeType: 'vscodeCommandNode', category: 'context' }
  ]), [getDefaultCapability]);

  const commandItems: QuickAddItem[] = useMemo(() => {
    const items: QuickAddItem[] = [];
    (commandGroups || []).forEach((group: any) => {
      (group.commands || []).forEach((command: any) => {
        const capability = String(command.capability || '');
        if (!capability) return;
        items.push({
          id: `cmd-${group.provider}-${capability}`,
          label: `${group.provider} · ${capability}`,
          nodeType: 'actionNode',
          category: 'providers',
          provider: group.provider,
          capability
        });
      });
    });
    return items;
  }, [commandGroups]);

  const customNodeItems: QuickAddItem[] = useMemo(() => {
    return (customNodes || []).map((node: any) => {
      const id = String(node?.id || '').trim();
      const title = String(node?.title || id || 'Custom').trim();
      return {
        id: `custom-${id}`,
        label: `Custom · ${title}`,
        nodeType: 'customNode',
        category: 'custom',
        customNodeId: id
      };
    }).filter((item: any) => !!item.customNodeId);
  }, [customNodes]);

  const paletteCategories = useMemo(() => {
    const categories = Array.isArray(uiPreset?.palette?.categories) ? uiPreset.palette.categories : [];
    return categories
      .filter((entry: any) => entry?.visible !== false)
      .sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0));
  }, [uiPreset]);

  const visibleCategoryIds = useMemo(
    () => new Set(paletteCategories.map((entry: any) => String(entry?.id || '').trim()).filter(Boolean)),
    [paletteCategories]
  );

  const categoryOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    paletteCategories.forEach((entry: any, index: number) => {
      const id = String(entry?.id || '').trim();
      if (!id) return;
      map.set(id, Number(entry?.order ?? index));
    });
    return map;
  }, [paletteCategories]);

  const pinnedQuickAddIds = useMemo(
    () => new Set((Array.isArray(uiPreset?.palette?.pinned) ? uiPreset.palette.pinned : []).map((value: any) => String(value || '').trim()).filter(Boolean)),
    [uiPreset]
  );

  const allQuickAddItems = useMemo(() => {
    const merged = [...presetItems, ...customNodeItems, ...commandItems]
      .filter((item) => visibleCategoryIds.has(item.category))
      .sort((a, b) => {
        const aPinned = pinnedQuickAddIds.has(a.id);
        const bPinned = pinnedQuickAddIds.has(b.id);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        const aOrder = categoryOrderMap.get(a.category) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = categoryOrderMap.get(b.category) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.label.localeCompare(b.label);
      });
    return merged;
  }, [categoryOrderMap, commandItems, customNodeItems, pinnedQuickAddIds, presetItems, visibleCategoryIds]);

  const filteredQuickAddItems = useMemo(
    () => filterQuickAdd(allQuickAddItems, quickAddQuery),
    [allQuickAddItems, quickAddQuery]
  );
  const filteredDockItems = useMemo(
    () => filterQuickAdd(allQuickAddItems, dockQuery),
    [allQuickAddItems, dockQuery]
  );

  const categoryTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    (paletteCategories || []).forEach((entry: any) => {
      const id = String(entry?.id || '').trim();
      if (!id) return;
      const title = String(entry?.title || id).trim();
      map.set(id, title || id);
    });
    return map;
  }, [paletteCategories]);

  const quickAddGroupedItems = useMemo(
    () => groupQuickAddItems(filteredQuickAddItems),
    [filteredQuickAddItems]
  );
  const dockGroupedItems = useMemo(
    () => groupQuickAddItems(filteredDockItems),
    [filteredDockItems]
  );

  const paletteLeft = quickAddAnchor ? Math.min(quickAddAnchor.x, window.innerWidth - 280) : 0;
  const paletteTop = quickAddAnchor ? Math.min(quickAddAnchor.y, window.innerHeight - 320) : 0;

  return {
    filteredQuickAddItems,
    filteredDockItems,
    categoryTitleMap,
    quickAddGroupedItems,
    dockGroupedItems,
    paletteLeft,
    paletteTop
  };
}

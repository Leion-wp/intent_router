import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

type CatalogSectionKey = 'flow' | 'ai' | 'review' | 'providers' | 'custom';

type CatalogItem = {
  id: string;
  category: 'flow' | 'ai' | 'review' | 'providers' | 'custom';
  type: string;
  provider?: string;
  customNodeId?: string;
  label: string;
  icon: string;
  desc: string;
};

type UseProvidersCatalogStateParams = {
  customNodes: Array<{ id: string; title: string }>;
  onDragStart: (event: React.DragEvent, nodeType: string, provider?: string) => void;
  onDragStartCustomNode: (event: React.DragEvent, customNodeId: string) => void;
};

type UseProvidersCatalogStateResult = {
  providersSearchRef: React.RefObject<HTMLInputElement | null>;
  providersSearch: string;
  setProvidersSearch: React.Dispatch<React.SetStateAction<string>>;
  catalogBySection: {
    flow: CatalogItem[];
    ai: CatalogItem[];
    review: CatalogItem[];
    providers: CatalogItem[];
    custom: CatalogItem[];
  };
  renderCatalogSection: (
    key: Exclude<CatalogSectionKey, 'custom'> | 'custom',
    title: string,
    sectionItems: CatalogItem[],
    extraAction?: React.ReactNode
  ) => React.ReactNode;
};

const baseNodeItems: CatalogItem[] = [
  { id: 'promptNode', category: 'flow', type: 'promptNode', label: 'Prompt', icon: 'codicon-symbol-string', desc: 'Set variable' },
  { id: 'formNode', category: 'flow', type: 'formNode', label: 'Form', icon: 'codicon-list-selection', desc: 'Collect inputs (HITL)' },
  { id: 'switchNode', category: 'flow', type: 'switchNode', label: 'Switch', icon: 'codicon-filter', desc: 'Route by condition' },
  { id: 'scriptNode', category: 'flow', type: 'scriptNode', label: 'Script', icon: 'codicon-file-code', desc: 'Run versioned script file' },
  { id: 'repoNode', category: 'flow', type: 'repoNode', label: 'Repo', icon: 'codicon-repo', desc: 'Set workspace path' },
  { id: 'vscodeCommandNode', category: 'flow', type: 'vscodeCommandNode', label: 'VS Code Command', icon: 'codicon-vscode', desc: 'Run any VS Code command' },
  { id: 'agentNode', category: 'ai', type: 'agentNode', label: 'AI Agent', icon: 'codicon-hubot', desc: 'Single specialized agent' },
  { id: 'teamNode', category: 'ai', type: 'teamNode', label: 'AI Team', icon: 'codicon-organization', desc: 'Multi-agent orchestration' },
  { id: 'approvalNode', category: 'review', type: 'approvalNode', label: 'Diff Review', icon: 'codicon-git-pull-request', desc: 'Human approval before write' },
  { id: 'httpNode', category: 'review', type: 'httpNode', label: 'HTTP Request', icon: 'codicon-globe', desc: 'Direct API call node' }
];

export function useProvidersCatalogState({
  customNodes,
  onDragStart,
  onDragStartCustomNode
}: UseProvidersCatalogStateParams): UseProvidersCatalogStateResult {
  const [providersSearch, setProvidersSearch] = useState<string>('');
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<CatalogSectionKey, boolean>>({
    flow: false,
    ai: false,
    review: false,
    providers: false,
    custom: false
  });
  const providersSearchRef = useRef<HTMLInputElement | null>(null);
  const persistStateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const state = window.vscode?.getState?.() || {};
      if (typeof state.providersSearch === 'string') {
        setProvidersSearch(state.providersSearch);
      }
      if (state.sectionCollapsed && typeof state.sectionCollapsed === 'object') {
        setSectionCollapsed({
          flow: !!state.sectionCollapsed.flow,
          ai: !!state.sectionCollapsed.ai,
          review: !!state.sectionCollapsed.review,
          providers: !!state.sectionCollapsed.providers,
          custom: !!state.sectionCollapsed.custom
        });
      }
    } catch {
      // ignore persisted UI state errors
    }
  }, []);

  useEffect(() => {
    try {
      if (persistStateTimerRef.current !== null) {
        clearTimeout(persistStateTimerRef.current);
      }
      persistStateTimerRef.current = window.setTimeout(() => {
        const prev = window.vscode?.getState?.() || {};
        window.vscode?.setState?.({
          ...prev,
          providersSearch,
          sectionCollapsed
        });
        persistStateTimerRef.current = null;
      }, 120);
    } catch {
      // ignore
    }
    return () => {
      if (persistStateTimerRef.current !== null) {
        clearTimeout(persistStateTimerRef.current);
        persistStateTimerRef.current = null;
      }
    };
  }, [providersSearch, sectionCollapsed]);

  useEffect(() => {
    const onFocusSidebarSearch = () => {
      providersSearchRef.current?.focus();
      providersSearchRef.current?.select();
    };
    window.addEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
    return () => window.removeEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
  }, []);

  const deferredProvidersSearch = useDeferredValue(providersSearch);
  const normalizedProvidersQuery = deferredProvidersSearch.trim().toLowerCase();

  const customCatalogItems = useMemo<CatalogItem[]>(() => {
    return customNodes.map((entry) => {
      const id = String(entry.id || '').trim();
      const title = String(entry.title || id || 'Custom').trim();
      return {
        id: `custom:${id}`,
        category: 'custom' as const,
        type: 'customNode',
        customNodeId: id,
        label: title,
        icon: 'codicon-symbol-structure',
        desc: 'Custom reusable node'
      };
    }).filter((entry) => !!entry.customNodeId);
  }, [customNodes]);

  const providerCatalogItems = useMemo<CatalogItem[]>(() => {
    const commandGroups = Array.isArray((window.initialData as any)?.commandGroups) ? (window.initialData as any).commandGroups : [];
    const preferredOrder = ['terminal', 'system', 'git', 'docker', 'http', 'github'];
    const iconByProvider: Record<string, string> = {
      terminal: 'codicon-terminal',
      system: 'codicon-settings-gear',
      git: 'codicon-git-commit',
      docker: 'codicon-container',
      http: 'codicon-globe',
      github: 'codicon-mark-github'
    };
    const descByProvider: Record<string, string> = {
      terminal: 'Run shell commands',
      system: 'Forms, switch, triggers, memory',
      git: 'Version control operations',
      docker: 'Container operations',
      http: 'HTTP runtime capabilities',
      github: 'PR and checks automation'
    };

    const dynamicProviders = commandGroups
      .map((group: any) => String(group?.provider || '').trim())
      .filter((name: string) => !!name && name !== 'custom' && name !== 'ai');

    const ordered = Array.from(new Set([...preferredOrder, ...dynamicProviders]));
    return ordered.map((provider) => ({
      id: `actionNode:${provider}`,
      category: 'providers' as const,
      type: 'actionNode',
      provider,
      label: provider.charAt(0).toUpperCase() + provider.slice(1),
      icon: iconByProvider[provider] || 'codicon-symbol-method',
      desc: descByProvider[provider] || 'Provider action capabilities'
    }));
  }, []);

  const allCatalogItems = useMemo(() => {
    return [...baseNodeItems, ...providerCatalogItems, ...customCatalogItems];
  }, [customCatalogItems, providerCatalogItems]);

  const catalogBySection = useMemo(() => {
    const matchesSearch = (label: string, desc: string) => {
      if (!normalizedProvidersQuery) return true;
      const line = `${label} ${desc}`.toLowerCase();
      return line.includes(normalizedProvidersQuery);
    };

    const section = {
      flow: [] as CatalogItem[],
      ai: [] as CatalogItem[],
      review: [] as CatalogItem[],
      providers: [] as CatalogItem[],
      custom: [] as CatalogItem[]
    };

    for (const item of allCatalogItems) {
      if (!matchesSearch(item.label, item.desc || '')) continue;
      if (item.category === 'flow') section.flow.push(item);
      if (item.category === 'ai') section.ai.push(item);
      if (item.category === 'review') section.review.push(item);
      if (item.category === 'providers') section.providers.push(item);
      if (item.category === 'custom') section.custom.push(item);
    }

    return section;
  }, [allCatalogItems, normalizedProvidersQuery]);

  const toggleSection = useCallback((key: CatalogSectionKey) => {
    setSectionCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const renderCatalogItem = useCallback((item: CatalogItem) => {
    const isCustom = item.type === 'customNode';
    return (
      <div
        key={item.id}
        className="dndnode"
        onDragStart={(event) => {
          if (isCustom) onDragStartCustomNode(event, String(item.customNodeId || ''));
          else onDragStart(event, item.type, item.provider);
        }}
        draggable
        title={`Drag to add ${item.label}${item.desc ? ` - ${item.desc}` : ''}`}
        aria-label={`Add ${item.label} node`}
        tabIndex={0}
        role="listitem"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span className={`codicon ${item.icon}`} style={{ fontSize: '16px', marginRight: '8px' }}></span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
        </span>
        <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', marginLeft: '8px' }}>{item.desc}</span>
      </div>
    );
  }, [onDragStart, onDragStartCustomNode]);

  const renderCatalogSection = useCallback((
    key: CatalogSectionKey,
    title: string,
    sectionItems: CatalogItem[],
    extraAction?: React.ReactNode
  ) => {
    const collapsed = !!sectionCollapsed[key];
    return (
      <div style={{ marginTop: key === 'flow' ? 0 : '10px', borderTop: key === 'flow' ? 'none' : '1px solid var(--vscode-panel-border)', paddingTop: key === 'flow' ? 0 : '10px' }}>
        <div style={{ fontSize: '11px', opacity: 0.88, padding: '0 2px 6px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <button
            className="nodrag"
            onClick={() => toggleSection(key)}
            style={{ background: 'transparent', border: 'none', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '11px', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          >
            <span className={`codicon ${collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}></span>
            <span>{title} ({sectionItems.length})</span>
          </button>
          {extraAction}
        </div>
        {!collapsed && (
          <div className="sidebar-list">
            {sectionItems.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: '12px', padding: '0 8px 8px 8px' }}>No items.</div>
            ) : (
              sectionItems.map((item) => renderCatalogItem(item))
            )}
          </div>
        )}
      </div>
    );
  }, [renderCatalogItem, sectionCollapsed, toggleSection]);

  return {
    providersSearchRef,
    providersSearch,
    setProvidersSearch,
    catalogBySection,
    renderCatalogSection
  };
}

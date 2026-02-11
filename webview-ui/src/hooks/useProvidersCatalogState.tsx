import React, { useEffect, useMemo, useRef, useState } from 'react';

type CatalogFilter = 'all' | 'context' | 'providers' | 'custom' | 'favorites';
type CatalogSectionKey = 'favorites' | 'context' | 'providers' | 'custom';

type CatalogItem = {
  id: string;
  category: 'context' | 'providers' | 'custom';
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
  providersFilter: CatalogFilter;
  setProvidersFilter: React.Dispatch<React.SetStateAction<CatalogFilter>>;
  catalogBySection: {
    favorites: CatalogItem[];
    context: CatalogItem[];
    providers: CatalogItem[];
    custom: CatalogItem[];
  };
  renderCatalogSection: (
    key: CatalogSectionKey,
    title: string,
    sectionItems: CatalogItem[],
    extraAction?: React.ReactNode
  ) => React.ReactNode;
};

const providerItems: CatalogItem[] = [
  { id: 'promptNode', category: 'context', type: 'promptNode', label: 'Prompt', icon: 'codicon-symbol-string', desc: 'Set variable' },
  { id: 'formNode', category: 'context', type: 'formNode', label: 'Form', icon: 'codicon-list-selection', desc: 'Collect inputs (HITL)' },
  { id: 'switchNode', category: 'context', type: 'switchNode', label: 'Switch', icon: 'codicon-filter', desc: 'Route by variable' },
  { id: 'scriptNode', category: 'context', type: 'scriptNode', label: 'Script', icon: 'codicon-file-code', desc: 'Run versioned script file' },
  { id: 'repoNode', category: 'context', type: 'repoNode', label: 'Repo', icon: 'codicon-repo', desc: 'Set workspace path' },
  { id: 'vscodeCommandNode', category: 'context', type: 'vscodeCommandNode', label: 'VS Code', icon: 'codicon-vscode', desc: 'Run an arbitrary VS Code command' },
  { id: 'actionNode:terminal', category: 'providers', type: 'actionNode', provider: 'terminal', label: 'Terminal', icon: 'codicon-terminal', desc: 'Run shell commands' },
  { id: 'actionNode:system', category: 'providers', type: 'actionNode', provider: 'system', label: 'System', icon: 'codicon-settings-gear', desc: 'Workflow controls' },
  { id: 'actionNode:git', category: 'providers', type: 'actionNode', provider: 'git', label: 'Git', icon: 'codicon-git-commit', desc: 'Version control operations' },
  { id: 'actionNode:docker', category: 'providers', type: 'actionNode', provider: 'docker', label: 'Docker', icon: 'codicon-container', desc: 'Container operations' }
];

export function useProvidersCatalogState({
  customNodes,
  onDragStart,
  onDragStartCustomNode
}: UseProvidersCatalogStateParams): UseProvidersCatalogStateResult {
  const [providersSearch, setProvidersSearch] = useState<string>('');
  const [providersFilter, setProvidersFilter] = useState<CatalogFilter>('all');
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<CatalogSectionKey, boolean>>({
    favorites: false,
    context: false,
    providers: false,
    custom: false
  });
  const [favoriteNodeIds, setFavoriteNodeIds] = useState<string[]>([]);
  const providersSearchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const state = window.vscode?.getState?.() || {};
      if (typeof state.providersSearch === 'string') {
        setProvidersSearch(state.providersSearch);
      }
      if (
        state.providersFilter === 'all' ||
        state.providersFilter === 'context' ||
        state.providersFilter === 'providers' ||
        state.providersFilter === 'custom' ||
        state.providersFilter === 'favorites'
      ) {
        setProvidersFilter(state.providersFilter);
      }
      if (Array.isArray(state.favoriteNodeIds)) {
        setFavoriteNodeIds(state.favoriteNodeIds.map((value: any) => String(value || '').trim()).filter(Boolean));
      }
      if (state.sectionCollapsed && typeof state.sectionCollapsed === 'object') {
        setSectionCollapsed({
          favorites: !!state.sectionCollapsed.favorites,
          context: !!state.sectionCollapsed.context,
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
      const prev = window.vscode?.getState?.() || {};
      window.vscode?.setState?.({
        ...prev,
        providersSearch,
        providersFilter,
        favoriteNodeIds,
        sectionCollapsed
      });
    } catch {
      // ignore
    }
  }, [providersSearch, providersFilter, favoriteNodeIds, sectionCollapsed]);

  useEffect(() => {
    const onFocusSidebarSearch = () => {
      providersSearchRef.current?.focus();
      providersSearchRef.current?.select();
    };
    window.addEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
    return () => window.removeEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
  }, []);

  const normalizedProvidersQuery = providersSearch.trim().toLowerCase();

  const customCatalogItems = useMemo(() => {
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

  const allCatalogItems = useMemo(() => {
    return [...providerItems, ...customCatalogItems];
  }, [customCatalogItems]);

  const catalogBySection = useMemo(() => {
    const matchesSearch = (label: string, desc: string) => {
      if (!normalizedProvidersQuery) return true;
      const line = `${label} ${desc}`.toLowerCase();
      return line.includes(normalizedProvidersQuery);
    };

    const section = {
      favorites: [] as CatalogItem[],
      context: [] as CatalogItem[],
      providers: [] as CatalogItem[],
      custom: [] as CatalogItem[]
    };

    const favoritesSet = new Set(favoriteNodeIds);
    for (const item of allCatalogItems) {
      if (!matchesSearch(item.label, item.desc || '')) continue;
      if (providersFilter !== 'all' && providersFilter !== item.category && !(providersFilter === 'favorites' && favoritesSet.has(item.id))) {
        continue;
      }
      if (favoritesSet.has(item.id)) {
        section.favorites.push(item);
      }
      if (item.category === 'context') section.context.push(item);
      if (item.category === 'providers') section.providers.push(item);
      if (item.category === 'custom') section.custom.push(item);
    }

    return section;
  }, [allCatalogItems, normalizedProvidersQuery, providersFilter, favoriteNodeIds]);

  const toggleSection = (key: CatalogSectionKey) => {
    setSectionCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFavorite = (id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    setFavoriteNodeIds((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return Array.from(set);
    });
  };

  const isFavorite = (id: string) => favoriteNodeIds.includes(String(id || '').trim());

  const renderCatalogItem = (item: CatalogItem) => {
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
        <button
          className="nodrag"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            toggleFavorite(item.id);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: isFavorite(item.id) ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-descriptionForeground)',
            cursor: 'pointer',
            padding: 0,
            marginLeft: '8px'
          }}
          title={isFavorite(item.id) ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite(item.id) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span className={`codicon ${isFavorite(item.id) ? 'codicon-star-full' : 'codicon-star-empty'}`}></span>
        </button>
      </div>
    );
  };

  const renderCatalogSection = (
    key: CatalogSectionKey,
    title: string,
    sectionItems: CatalogItem[],
    extraAction?: React.ReactNode
  ) => {
    const collapsed = !!sectionCollapsed[key];
    return (
      <div style={{ marginTop: key === 'favorites' ? 0 : '10px', borderTop: key === 'favorites' ? 'none' : '1px solid var(--vscode-panel-border)', paddingTop: key === 'favorites' ? 0 : '10px' }}>
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
  };

  return {
    providersSearchRef,
    providersSearch,
    setProvidersSearch,
    providersFilter,
    setProvidersFilter,
    catalogBySection,
    renderCatalogSection
  };
}

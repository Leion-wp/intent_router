import React, { useMemo, useState, useEffect, useRef } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from './types/messages';
import SchemaArgsForm, { SchemaField } from './components/SchemaArgsForm';
import { defaultThemeTokens, normalizeThemeTokens, normalizeUiPreset, SidebarTabPreset, SidebarTabType, UiPreset } from './types/theme';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
  adminMode?: boolean;
  tab?: string;
  onTabChange?: (tab: string) => void;
  tabs?: SidebarTabPreset[];
  uiPreset?: UiPreset;
  uiPresetRelease?: UiPreset;
};

// Acquire VS Code API (safe singleton) - reuse from App or get from global
declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

function resolveSidebarView(type: SidebarTabType | string | undefined): 'providers' | 'history' | 'environment' | 'studio' {
  if (type === 'history') return 'history';
  if (type === 'settings') return 'environment';
  if (type === 'studio' || type === 'importExport') return 'studio';
  return 'providers';
}

export default function Sidebar({ history = [], onSelectHistory, onRestoreHistory, adminMode = false, tab: tabProp, onTabChange, tabs = [], uiPreset, uiPresetRelease }: SidebarProps) {
  const [internalTab, setInternalTab] = useState<string>('nodes');
  const tab = tabProp ?? internalTab;
  const setTab = (next: string) => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  const [envVars, setEnvVars] = useState<{ key: string, value: string, visible: boolean }[]>([]);
  const [customNodes, setCustomNodes] = useState<any[]>((window.initialData?.customNodes as any[]) || []);
  const [studioSelectedId, setStudioSelectedId] = useState<string>('');
  const [studioDraft, setStudioDraft] = useState<any>(null);
  const [studioMappingJson, setStudioMappingJson] = useState<string>('{}');
  const [studioPreviewValues, setStudioPreviewValues] = useState<Record<string, any>>({});
  const [studioError, setStudioError] = useState<string>('');
  const [studioExportJson, setStudioExportJson] = useState<string>('');
  const [studioImportJson, setStudioImportJson] = useState<string>('');
  const [studioImportSummary, setStudioImportSummary] = useState<string>('');
  const [uiPresetDraft, setUiPresetDraft] = useState<UiPreset>(() => normalizeUiPreset(window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } }));
  const [themeExportJson, setThemeExportJson] = useState<string>('');
  const [themeImportJson, setThemeImportJson] = useState<string>('');
  const [themeError, setThemeError] = useState<string>('');
  const [uiPropagateSummary, setUiPropagateSummary] = useState<string>('');
  const [releasePreset, setReleasePreset] = useState<UiPreset>(() => normalizeUiPreset(window.initialData?.uiPresetRelease || window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } }));
  const [providersSearch, setProvidersSearch] = useState<string>('');
  const [providersFilter, setProvidersFilter] = useState<'all' | 'context' | 'providers' | 'custom' | 'favorites'>('all');
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({
    favorites: false,
    context: false,
    providers: false,
    custom: false
  });
  const [favoriteNodeIds, setFavoriteNodeIds] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyScrollTop, setHistoryScrollTop] = useState<number>(0);
  const [historyViewportHeight, setHistoryViewportHeight] = useState<number>(360);
  const providersSearchRef = useRef<HTMLInputElement | null>(null);
  const historyContainerRef = useRef<HTMLDivElement | null>(null);
  const devMode = !!window.initialData?.devMode;

  const effectiveTabs = useMemo(() => {
    if (Array.isArray(tabs) && tabs.length > 0) {
      return tabs.filter(entry => entry?.visible !== false);
    }
    return normalizeUiPreset(uiPreset || window.initialData?.uiPreset || {}).sidebar.tabs.filter(entry => entry.visible !== false);
  }, [tabs, uiPreset]);

  const activeTabConfig = useMemo(
    () => effectiveTabs.find(entry => entry.id === tab),
    [effectiveTabs, tab]
  );
  const activeView = resolveSidebarView(activeTabConfig?.type);

  useEffect(() => {
    if (!uiPreset) return;
    setUiPresetDraft(normalizeUiPreset(uiPreset));
  }, [uiPreset]);

  useEffect(() => {
    if (!uiPresetRelease) return;
    setReleasePreset(normalizeUiPreset(uiPresetRelease));
  }, [uiPresetRelease]);

  useEffect(() => {
    try {
      const state = window.vscode?.getState?.() || {};
      if (typeof state.providersSearch === 'string') {
        setProvidersSearch(state.providersSearch);
      }
      if (state.providersFilter === 'all' || state.providersFilter === 'context' || state.providersFilter === 'providers' || state.providersFilter === 'custom' || state.providersFilter === 'favorites') {
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
      if (typeof state.historySearch === 'string') {
        setHistorySearch(state.historySearch);
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
        sectionCollapsed,
        historySearch
      });
    } catch {
      // ignore
    }
  }, [providersSearch, providersFilter, favoriteNodeIds, sectionCollapsed, historySearch]);

  useEffect(() => {
    const onFocusSidebarSearch = () => {
      providersSearchRef.current?.focus();
      providersSearchRef.current?.select();
    };
    window.addEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
    return () => window.removeEventListener('intentRouter.focusSidebarSearch', onFocusSidebarSearch as EventListener);
  }, []);

  useEffect(() => {
    const updateViewportHeight = () => {
      const el = historyContainerRef.current;
      if (!el) return;
      setHistoryViewportHeight(Math.max(180, el.clientHeight || 360));
    };
    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, [activeView]);

	  useEffect(() => {
	    const loadEnv = (data: any) => {
	        if (data) {
            const loaded = Object.entries(data).map(([k, v]) => ({
                key: k,
                value: String(v),
                visible: false
            }));
            setEnvVars(loaded);
        }
    };

    if (window.initialData?.environment) {
        loadEnv(window.initialData.environment);
    }

	    const handleMessage = (event: MessageEvent) => {
	        if (!isInboundMessage(event.data)) {
	            return;
	        }
	        if (event.data.type === 'environmentUpdate') {
	             loadEnv(event.data.environment);
	        }
          if (event.data.type === 'customNodesUpdate') {
            setCustomNodes((event.data as any).nodes || []);
          }
          if (event.data.type === 'customNodesExported') {
            setStudioExportJson(String((event.data as any).json || ''));
          }
          if (event.data.type === 'customNodesImported') {
            const renames = (event.data as any).renames || {};
            const renamedCount = Object.keys(renames).length;
            const importedCount = ((event.data as any).imported || []).length;
            setStudioImportSummary(
              `Imported ${importedCount} node(s).` + (renamedCount ? ` Renamed ${renamedCount} due to ID conflicts.` : '')
            );
          }
          if (event.data.type === 'customNodesImportError') {
            setStudioImportSummary(`Import failed: ${String((event.data as any).message || '')}`);
          }
          if (event.data.type === 'uiPresetUpdate') {
            setUiPresetDraft(normalizeUiPreset((event.data as any)?.uiPreset || {}));
          }
          if (event.data.type === 'uiPresetReleaseUpdate') {
            setReleasePreset(normalizeUiPreset((event.data as any)?.uiPreset || {}));
          }
          if (event.data.type === 'uiPresetExported') {
            setThemeExportJson(String((event.data as any).json || ''));
          }
          if (event.data.type === 'uiPresetPropagated') {
            const payload = event.data as any;
            setUiPropagateSummary(`Propagated: ${String(payload?.summary || '')}`);
          }
          if (event.data.type === 'error') {
            setThemeError(String((event.data as any).message || ''));
          }
	    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (effectiveTabs.length === 0) return;
    if (!effectiveTabs.some(entry => entry.id === tab)) {
      setTab(effectiveTabs[0].id);
    }
  }, [effectiveTabs, tab]);

  const allCapabilities: string[] = useMemo(() => {
    const groups = (window.initialData?.commandGroups as any[]) || [];
    const out: string[] = [];
    for (const g of groups) {
      for (const c of (g?.commands || [])) {
        const cap = String(c?.capability || '').trim();
        if (cap) out.push(cap);
      }
    }
    out.sort();
    return out;
  }, []);

  const saveEnv = (newVars: typeof envVars) => {
    setEnvVars(newVars);
    const envObj = newVars.reduce((acc, curr) => {
        if (curr.key) acc[curr.key] = curr.value;
        return acc;
    }, {} as Record<string, string>);

	    if (window.vscode) {
	        const msg: WebviewOutboundMessage = {
	            type: 'saveEnvironment',
	            environment: envObj
	        };
	        window.vscode.postMessage(msg);
	    }
	  };

  const addEnvVar = () => {
      const newVars = [...envVars, { key: '', value: '', visible: true }];
      setEnvVars(newVars);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', val: string) => {
      const newVars = [...envVars];
      newVars[index] = { ...newVars[index], [field]: val };
      setEnvVars(newVars);
  };

  const toggleVisibility = (index: number) => {
      const newVars = [...envVars];
      newVars[index] = { ...newVars[index], visible: !newVars[index].visible };
      setEnvVars(newVars);
  };

  const removeEnvVar = (index: number) => {
      const newVars = envVars.filter((_, i) => i !== index);
      saveEnv(newVars);
  };

  const handleBlur = () => {
      saveEnv(envVars);
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, provider?: string) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    if (provider) {
        event.dataTransfer.setData('application/reactflow/provider', provider);
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragStartCustomNode = (event: React.DragEvent, customNodeId: string) => {
    event.dataTransfer.setData('application/reactflow/type', 'customNode');
    event.dataTransfer.setData('application/reactflow/customNodeId', customNodeId);
    event.dataTransfer.effectAllowed = 'move';
  };

	  const clearHistory = () => {
	    if (window.vscode) {
	        const msg: WebviewOutboundMessage = { type: 'clearHistory' };
	        window.vscode.postMessage(msg);
	    }
	  };

  const items = [
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

  const normalizedProvidersQuery = providersSearch.trim().toLowerCase();

  const customCatalogItems = useMemo(() => {
    return (customNodes || []).map((entry: any) => {
      const id = String(entry?.id || '').trim();
      const title = String(entry?.title || id || 'Custom').trim();
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
    return [...items, ...customCatalogItems];
  }, [customCatalogItems]);

  const catalogBySection = useMemo(() => {
    const matchesSearch = (label: string, desc: string) => {
      if (!normalizedProvidersQuery) return true;
      const l = `${label} ${desc}`.toLowerCase();
      return l.includes(normalizedProvidersQuery);
    };

    const section = {
      favorites: [] as any[],
      context: [] as any[],
      providers: [] as any[],
      custom: [] as any[]
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

  const toggleSection = (key: 'favorites' | 'context' | 'providers' | 'custom') => {
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

  const renderCatalogItem = (item: any) => {
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
    key: 'favorites' | 'context' | 'providers' | 'custom',
    title: string,
    sectionItems: any[],
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

  const startNewDraft = () => {
    const draft = { id: '', title: '', intent: '', schema: [] as SchemaField[], mapping: {} as any };
    setStudioDraft(draft);
    setStudioSelectedId('');
    setStudioMappingJson('{}');
    setStudioPreviewValues({});
    setStudioExportJson('');
    setStudioImportJson('');
    setStudioImportSummary('');
    setStudioError('');
  };

  const selectDraft = (id: string) => {
    const found = (customNodes || []).find((n: any) => String(n?.id || '') === id);
    if (!found) return;
    setStudioSelectedId(id);
    setStudioDraft({
      id: String(found.id || ''),
      title: String(found.title || ''),
      intent: String(found.intent || ''),
      schema: Array.isArray(found.schema) ? found.schema : [],
      mapping: found.mapping && typeof found.mapping === 'object' ? found.mapping : {}
    });
    setStudioMappingJson(JSON.stringify((found.mapping && typeof found.mapping === 'object') ? found.mapping : {}, null, 2));
    setStudioPreviewValues({});
    setStudioExportJson('');
    setStudioImportJson('');
    setStudioImportSummary('');
    setStudioError('');
  };

  const saveDraft = () => {
    if (!studioDraft) return;
    const id = String(studioDraft.id || '').trim();
    const title = String(studioDraft.title || '').trim();
    const intent = String(studioDraft.intent || '').trim();
    if (!id || !title || !intent) {
      setStudioError('id, title, intent are required.');
      return;
    }

    let mapping: any = {};
    try {
      mapping = studioMappingJson.trim() ? JSON.parse(studioMappingJson) : {};
    } catch (e: any) {
      setStudioError(`Invalid mapping JSON: ${e?.message || e}`);
      return;
    }

    const node = {
      id,
      title,
      intent,
      schema: Array.isArray(studioDraft.schema) ? studioDraft.schema : [],
      mapping: mapping && typeof mapping === 'object' ? mapping : {}
    };

    setStudioError('');
    if (window.vscode) {
      const msg: WebviewOutboundMessage = { type: 'customNodes.upsert', node };
      window.vscode.postMessage(msg);
    }
    setStudioSelectedId(id);
  };

  const deleteDraft = (id: string) => {
    const target = String(id || '').trim();
    if (!target) return;
    if (window.vscode) {
      const msg: WebviewOutboundMessage = { type: 'customNodes.delete', id: target };
      window.vscode.postMessage(msg);
    }
    if (studioSelectedId === target) {
      setStudioSelectedId('');
      setStudioDraft(null);
      setStudioMappingJson('{}');
      setStudioPreviewValues({});
      setStudioError('');
    }
  };

  const exportSelectedOrAll = (scope: 'one' | 'all') => {
    if (!window.vscode) return;
    const id = scope === 'one' ? String(studioSelectedId || '') : undefined;
    const msg: WebviewOutboundMessage = { type: 'customNodes.export', scope, id };
    window.vscode.postMessage(msg);
  };

  const importFromPaste = () => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'customNodes.import', source: 'paste', jsonText: studioImportJson };
    window.vscode.postMessage(msg);
  };

  const importFromFile = () => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'customNodes.import', source: 'file' };
    window.vscode.postMessage(msg);
  };

  const setThemeToken = (path: string, value: string) => {
    const current = normalizeThemeTokens(uiPresetDraft?.theme?.tokens || {});
    const [group, key] = path.split('.');
    if (!group || !key) return;
    const next: any = {
      ...current,
      [group]: {
        ...(current as any)[group],
        [key]: value
      }
    };
    setUiPresetDraft({
      ...uiPresetDraft,
      theme: { tokens: normalizeThemeTokens(next) }
    });
  };

  const saveThemeDraft = () => {
    if (!window.vscode) return;
    setThemeError('');
    const msg: WebviewOutboundMessage = { type: 'uiPreset.saveDraft', uiPreset: uiPresetDraft };
    window.vscode.postMessage(msg);
  };

  const resetThemeDraft = () => {
    if (!window.vscode) return;
    setThemeError('');
    const msg: WebviewOutboundMessage = { type: 'uiPreset.resetDraft' };
    window.vscode.postMessage(msg);
  };

  const exportTheme = () => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'uiPreset.exportCurrent' };
    window.vscode.postMessage(msg);
  };

  const importTheme = (source: 'paste' | 'file') => {
    if (!window.vscode) return;
    setThemeError('');
    const msg: WebviewOutboundMessage = { type: 'uiPreset.importDraft', source, jsonText: source === 'paste' ? themeImportJson : undefined };
    window.vscode.postMessage(msg);
  };

  const resetThemeDefaults = () => {
    if (!window.vscode) return;
    setThemeError('');
    const msg: WebviewOutboundMessage = { type: 'uiPreset.resetToDefaults' };
    window.vscode.postMessage(msg);
  };

  const propagateThemeDraft = () => {
    if (!window.vscode) return;
    setThemeError('');
    setUiPropagateSummary('');
    const msg: WebviewOutboundMessage = { type: 'uiPreset.propagateDraft' };
    window.vscode.postMessage(msg);
  };

  const updateSidebarTabs = (nextTabs: SidebarTabPreset[]) => {
    const normalized = normalizeUiPreset({ ...uiPresetDraft, sidebar: { tabs: nextTabs }, palette: uiPresetDraft.palette, theme: uiPresetDraft.theme });
    setUiPresetDraft(normalized);
  };

  const updateSidebarTabField = (id: string, patch: Partial<SidebarTabPreset>) => {
    const nextTabs = (uiPresetDraft.sidebar.tabs || []).map((entry) => (
      entry.id === id ? { ...entry, ...patch } : entry
    ));
    updateSidebarTabs(nextTabs);
  };

  const moveSidebarTab = (id: string, direction: -1 | 1) => {
    const current = [...(uiPresetDraft.sidebar.tabs || [])];
    const index = current.findIndex(entry => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const temp = current[index];
    current[index] = current[target];
    current[target] = temp;
    updateSidebarTabs(current);
  };

  const addSidebarTab = () => {
    const nextIndex = (uiPresetDraft.sidebar.tabs || []).length + 1;
    updateSidebarTabs([
      ...(uiPresetDraft.sidebar.tabs || []),
      {
        id: `tab-${nextIndex}`,
        title: `TAB ${nextIndex}`,
        icon: 'codicon-symbol-misc',
        type: 'pipelines',
        visible: true
      }
    ]);
  };

  const removeSidebarTab = (id: string) => {
    const nextTabs = (uiPresetDraft.sidebar.tabs || []).filter(entry => entry.id !== id);
    if (nextTabs.length === 0) return;
    updateSidebarTabs(nextTabs);
  };

  const updatePaletteCategory = (id: string, patch: Record<string, any>) => {
    const nextCategories = (uiPresetDraft.palette.categories || []).map((entry: any) => (
      entry.id === id ? { ...entry, ...patch } : entry
    ));
    setUiPresetDraft(normalizeUiPreset({
      ...uiPresetDraft,
      palette: { ...uiPresetDraft.palette, categories: nextCategories }
    }));
  };

  const movePaletteCategory = (id: string, direction: -1 | 1) => {
    const ordered = [...(uiPresetDraft.palette.categories || [])].sort((a, b) => Number(a.order) - Number(b.order));
    const index = ordered.findIndex(entry => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const temp = ordered[index];
    ordered[index] = ordered[target];
    ordered[target] = temp;
    const reOrdered = ordered.map((entry, idx) => ({ ...entry, order: idx }));
    setUiPresetDraft(normalizeUiPreset({
      ...uiPresetDraft,
      palette: { ...uiPresetDraft.palette, categories: reOrdered }
    }));
  };

  const updatePinnedList = (raw: string) => {
    const pinned = raw
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    setUiPresetDraft(normalizeUiPreset({
      ...uiPresetDraft,
      palette: { ...uiPresetDraft.palette, pinned }
    }));
  };

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter((run: any) => {
      const name = String(run?.name || '').toLowerCase();
      const status = String(run?.status || '').toLowerCase();
      const time = new Date(run?.timestamp || 0).toLocaleTimeString().toLowerCase();
      return `${name} ${status} ${time}`.includes(q);
    });
  }, [history, historySearch]);

  const uiDraftValidationErrors = useMemo(() => {
    const errors: string[] = [];
    const tabs = Array.isArray(uiPresetDraft?.sidebar?.tabs) ? uiPresetDraft.sidebar.tabs : [];
    if (!tabs.length) {
      errors.push('At least one sidebar tab is required.');
    }
    const ids = new Set<string>();
    for (const tabEntry of tabs) {
      const id = String(tabEntry?.id || '').trim();
      if (!id) {
        errors.push('Sidebar tab id cannot be empty.');
        continue;
      }
      if (ids.has(id)) {
        errors.push(`Duplicate sidebar tab id: ${id}`);
      }
      ids.add(id);
    }
    if (!tabs.some((entry) => entry?.visible !== false)) {
      errors.push('At least one sidebar tab must remain visible.');
    }
    const categories = Array.isArray(uiPresetDraft?.palette?.categories) ? uiPresetDraft.palette.categories : [];
    const requiredCategoryIds = ['context', 'providers', 'custom'];
    for (const requiredId of requiredCategoryIds) {
      if (!categories.some((entry: any) => String(entry?.id || '').trim() === requiredId)) {
        errors.push(`Missing palette category: ${requiredId}`);
      }
    }
    return errors;
  }, [uiPresetDraft]);

  const uiDraftDiff = useMemo(() => {
    const release = normalizeUiPreset(releasePreset || {});
    const draft = normalizeUiPreset(uiPresetDraft || {});
    const diff = {
      themeChanged: JSON.stringify(release.theme.tokens) !== JSON.stringify(draft.theme.tokens),
      tabsChanged: JSON.stringify(release.sidebar.tabs) !== JSON.stringify(draft.sidebar.tabs),
      categoriesChanged: JSON.stringify(release.palette.categories) !== JSON.stringify(draft.palette.categories),
      pinnedChanged: JSON.stringify(release.palette.pinned) !== JSON.stringify(draft.palette.pinned)
    };
    return {
      ...diff,
      hasChanges: diff.themeChanged || diff.tabsChanged || diff.categoriesChanged || diff.pinnedChanged
    };
  }, [releasePreset, uiPresetDraft]);

  const canPropagate = adminMode && uiDraftValidationErrors.length === 0 && uiDraftDiff.hasChanges;

  const HISTORY_ROW_HEIGHT = 92;
  const HISTORY_OVERSCAN = 6;
  const historyTotalHeight = filteredHistory.length * HISTORY_ROW_HEIGHT;
  const historyStartIndex = Math.max(0, Math.floor(historyScrollTop / HISTORY_ROW_HEIGHT) - HISTORY_OVERSCAN);
  const historyVisibleCount = Math.max(1, Math.ceil(historyViewportHeight / HISTORY_ROW_HEIGHT) + HISTORY_OVERSCAN * 2);
  const historyEndIndex = Math.min(filteredHistory.length, historyStartIndex + historyVisibleCount);
  const historyWindow = filteredHistory.slice(historyStartIndex, historyEndIndex);

  return (
    <aside className="sidebar">
      <div
        className="sidebar-header"
        role="tablist"
        aria-label="Sidebar Sections"
        style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}
      >
          {effectiveTabs.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              aria-controls={`panel-${entry.id}`}
              id={`tab-${entry.id}`}
              onClick={() => setTab(entry.id)}
              className="sidebar-tab"
              title={entry.title}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span className={`codicon ${entry.icon || 'codicon-symbol-misc'}`} style={{ fontSize: '12px' }} />
              <span>{entry.title}</span>
            </button>
          ))}
      </div>

	      <div className="sidebar-content" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {activeView === 'providers' && (
             <div className="sidebar-list">
               <input
                 ref={providersSearchRef}
                 className="nodrag"
                 value={providersSearch}
                 onChange={(event) => setProvidersSearch(event.target.value)}
                 placeholder="Search nodes..."
                 style={{
                   width: '100%',
                   background: 'var(--vscode-input-background)',
                   color: 'var(--vscode-input-foreground)',
                   border: '1px solid var(--vscode-input-border)',
                   padding: '6px',
                   fontSize: '11px',
                   borderRadius: '4px'
                 }}
               />
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                 {[
                   { key: 'all', label: 'All' },
                   { key: 'favorites', label: 'Fav' },
                   { key: 'context', label: 'Context' },
                   { key: 'providers', label: 'Providers' },
                   { key: 'custom', label: 'Custom' }
                 ].map((entry) => (
                   <button
                     key={entry.key}
                     className="nodrag"
                     onClick={() => setProvidersFilter(entry.key as any)}
                     style={{
                       padding: '4px 8px',
                       border: '1px solid var(--vscode-panel-border)',
                       borderRadius: '999px',
                       background: providersFilter === entry.key ? 'var(--vscode-button-secondaryBackground)' : 'transparent',
                       color: providersFilter === entry.key ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-foreground)',
                       fontSize: '10px',
                       cursor: 'pointer'
                     }}
                   >
                     {entry.label}
                   </button>
                 ))}
               </div>

               {(providersFilter === 'all' || providersFilter === 'favorites') && catalogBySection.favorites.length > 0 && renderCatalogSection('favorites', 'Favorites', catalogBySection.favorites)}
               {(providersFilter === 'all' || providersFilter === 'context') && renderCatalogSection('context', 'Context', catalogBySection.context)}
               {(providersFilter === 'all' || providersFilter === 'providers') && renderCatalogSection('providers', 'Providers', catalogBySection.providers)}
               {(providersFilter === 'all' || providersFilter === 'custom') && renderCatalogSection(
                 'custom',
                 'Custom Nodes',
                 catalogBySection.custom,
                 <button
                   className="nodrag"
                   onClick={() => {
                     const studioTab = effectiveTabs.find(entry => entry.type === 'studio' || entry.type === 'importExport');
                     if (studioTab) setTab(studioTab.id);
                   }}
                   style={{
                     background: 'none',
                     border: 'none',
                     color: 'var(--vscode-textLink-foreground)',
                     cursor: 'pointer',
                     fontSize: '11px'
                   }}
                   title="Open Node Studio"
                 >
                   Open Studio
                 </button>
               )}

               {devMode && (
                 <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--vscode-panel-border)' }}>
                   <div style={{ fontSize: '11px', opacity: 0.85, padding: '0 8px 6px 8px' }}>Dev</div>
                   <button
                     className="nodrag"
                     onClick={() => {
                       if (!window.vscode) return;
                       const msg: WebviewOutboundMessage = { type: 'devPackager.loadPreset' };
                       window.vscode.postMessage(msg);
                     }}
                     style={{
                       width: '100%',
                       padding: '6px',
                       background: 'var(--vscode-button-background)',
                       color: 'var(--vscode-button-foreground)',
                       border: 'none',
                       cursor: 'pointer',
                       fontSize: '11px'
                     }}
                     title="Load the Dev Packager preset pipeline into the builder"
                   >
                     Load Dev Packager
                   </button>
                 </div>
               )}
            </div>
        )}

	        {activeView === 'history' && (
	            <div className="sidebar-list" style={{ minHeight: '220px' }}>
                <input
                  className="nodrag"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Search history..."
                  style={{
                    width: '100%',
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    padding: '6px',
                    fontSize: '11px',
                    borderRadius: '4px'
                  }}
                />
                {filteredHistory.length === 0 && <div style={{opacity: 0.6, fontSize: '12px', padding: '8px'}}>No history available.</div>}
                {filteredHistory.length > 0 && (
                  <div
                    ref={(el) => {
                      historyContainerRef.current = el;
                      if (el) {
                        setHistoryViewportHeight(Math.max(180, el.clientHeight || 360));
                      }
                    }}
                    style={{ height: 'calc(100vh - 280px)', minHeight: '220px', maxHeight: '60vh', overflowY: 'auto', position: 'relative' }}
                    onScroll={(event) => setHistoryScrollTop((event.currentTarget as HTMLDivElement).scrollTop)}
                  >
                    <div style={{ height: `${historyTotalHeight}px`, position: 'relative' }}>
                      {historyWindow.map((run: any, localIndex: number) => {
                        const absoluteIndex = historyStartIndex + localIndex;
                        return (
                          <div
                            key={String(run.id || absoluteIndex)}
                            onClick={() => onSelectHistory?.({ ...run })}
                            style={{
                              position: 'absolute',
                              top: `${absoluteIndex * HISTORY_ROW_HEIGHT}px`,
                              left: 0,
                              right: 0,
                              padding: '8px',
                              background: 'var(--vscode-list-hoverBackground)',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              border: '1px solid transparent',
                              marginBottom: '8px',
                              minHeight: `${HISTORY_ROW_HEIGHT - 8}px`,
                              boxSizing: 'border-box'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.border = '1px solid var(--vscode-focusBorder)'}
                            onMouseOut={(e) => e.currentTarget.style.border = '1px solid transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                              <div style={{fontWeight: 'bold', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{run.name}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (run.pipelineSnapshot) {
                                    onRestoreHistory?.(run);
                                  }
                                }}
                                disabled={!run.pipelineSnapshot}
                                title={run.pipelineSnapshot ? 'Restore this snapshot in the builder' : 'No snapshot available for this run'}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '10px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--vscode-panel-border)',
                                  background: run.pipelineSnapshot ? 'var(--vscode-button-background)' : 'transparent',
                                  color: run.pipelineSnapshot ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                                  cursor: run.pipelineSnapshot ? 'pointer' : 'not-allowed',
                                  opacity: run.pipelineSnapshot ? 1 : 0.6
                                }}
                              >
                                Restore
                              </button>
                            </div>
                            <div style={{fontSize: '10px', opacity: 0.8, display: 'flex', justifyContent: 'space-between'}}>
                              <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                              <span style={{
                                color: run.status === 'success' ? 'var(--ir-status-success)' :
                                  run.status === 'failure' ? 'var(--ir-status-error)' :
                                  run.status === 'cancelled' ? '#e6c300' :
                                  'var(--vscode-descriptionForeground)'
                              }}>
                                {String(run.status || '').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
	            </div>
	        )}

        {activeView === 'studio' && (
          <div style={{ padding: '0 8px' }}>
            {adminMode && (
              <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Theme Studio (Admin)</div>
                {[
                  {
                    title: 'Run + Add',
                    fields: [
                      ['runButton.idle', 'Run idle'],
                      ['runButton.running', 'Run running'],
                      ['runButton.success', 'Run success'],
                      ['runButton.error', 'Run error'],
                      ['runButton.foreground', 'Run fg'],
                      ['addButton.background', 'Add bg'],
                      ['addButton.foreground', 'Add fg'],
                      ['addButton.border', 'Add border']
                    ]
                  },
                  {
                    title: 'Node + Status',
                    fields: [
                      ['node.background', 'Node bg'],
                      ['node.border', 'Node border'],
                      ['node.text', 'Node text'],
                      ['status.running', 'Status running'],
                      ['status.success', 'Status success'],
                      ['status.error', 'Status error']
                    ]
                  },
                  {
                    title: 'Edges + Minimap + Controls',
                    fields: [
                      ['edges.idle', 'Edge idle'],
                      ['edges.running', 'Edge running'],
                      ['edges.success', 'Edge success'],
                      ['edges.error', 'Edge error'],
                      ['minimap.background', 'MiniMap bg'],
                      ['minimap.node', 'MiniMap node'],
                      ['minimap.mask', 'MiniMap mask'],
                      ['minimap.viewportBorder', 'MiniMap border'],
                      ['controls.background', 'Controls bg'],
                      ['controls.buttonBackground', 'Controls btn bg'],
                      ['controls.buttonForeground', 'Controls btn fg'],
                      ['controls.buttonHoverBackground', 'Controls hover bg'],
                      ['controls.buttonHoverForeground', 'Controls hover fg']
                    ]
                  }
                ].map((section) => (
                  <div key={section.title} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>{section.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: '6px', alignItems: 'center' }}>
                      {section.fields.map(([path, label]) => {
                        const [group, key] = path.split('.');
                        const value = String(((uiPresetDraft.theme.tokens as any)[group] || {})[key] || '#000000');
                        return (
                          <React.Fragment key={path}>
                            <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}</label>
                            <input
                              className="nodrag"
                              type="color"
                              value={value}
                              onChange={(e) => setThemeToken(path, e.target.value)}
                              style={{ width: '100%', height: '24px', border: '1px solid var(--vscode-panel-border)', background: 'transparent' }}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>UI Studio v1 — Sidebar Tabs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(uiPresetDraft.sidebar.tabs || []).map((entry, index) => (
                      <div key={entry.id} style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', padding: '6px', display: 'grid', gridTemplateColumns: '1fr 92px 92px', gap: '6px' }}>
                        <input
                          className="nodrag"
                          value={entry.title}
                          onChange={(e) => updateSidebarTabField(entry.id, { title: e.target.value })}
                          placeholder="Title"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                        />
                        <select
                          className="nodrag"
                          value={entry.type}
                          onChange={(e) => updateSidebarTabField(entry.id, { type: e.target.value as SidebarTabType })}
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                        >
                          <option value="pipelines">pipelines</option>
                          <option value="history">history</option>
                          <option value="settings">settings</option>
                          <option value="catalog">catalog</option>
                          <option value="importExport">importExport</option>
                          <option value="studio">studio</option>
                        </select>
                        <input
                          className="nodrag"
                          value={entry.icon}
                          onChange={(e) => updateSidebarTabField(entry.id, { icon: e.target.value })}
                          placeholder="codicon-*"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                        />
                        <input
                          className="nodrag"
                          value={entry.id}
                          onChange={(e) => updateSidebarTabField(entry.id, { id: e.target.value })}
                          placeholder="id"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', opacity: 0.9 }}>
                          <input
                            className="nodrag"
                            type="checkbox"
                            checked={entry.visible !== false}
                            onChange={(e) => updateSidebarTabField(entry.id, { visible: e.target.checked })}
                          />
                          visible
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                          <button className="nodrag" onClick={() => moveSidebarTab(entry.id, -1)} disabled={index === 0} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↑</button>
                          <button className="nodrag" onClick={() => moveSidebarTab(entry.id, 1)} disabled={index === (uiPresetDraft.sidebar.tabs.length - 1)} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === (uiPresetDraft.sidebar.tabs.length - 1) ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↓</button>
                          <button className="nodrag" onClick={() => removeSidebarTab(entry.id)} disabled={uiPresetDraft.sidebar.tabs.length <= 1} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-errorForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: uiPresetDraft.sidebar.tabs.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="nodrag" onClick={addSidebarTab} style={{ marginTop: '2px', padding: '5px 8px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      + Add Tab
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>UI Studio v1 — Palette</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {([...uiPresetDraft.palette.categories] || []).sort((a, b) => Number(a.order) - Number(b.order)).map((entry, index, list) => (
                      <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: '6px', alignItems: 'center', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', padding: '6px' }}>
                        <input
                          className="nodrag"
                          value={entry.title}
                          onChange={(e) => updatePaletteCategory(entry.id, { title: e.target.value })}
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                          <input
                            className="nodrag"
                            type="checkbox"
                            checked={entry.visible !== false}
                            onChange={(e) => updatePaletteCategory(entry.id, { visible: e.target.checked })}
                          />
                          visible
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                          <button className="nodrag" onClick={() => movePaletteCategory(entry.id, -1)} disabled={index === 0} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↑</button>
                          <button className="nodrag" onClick={() => movePaletteCategory(entry.id, 1)} disabled={index === (list.length - 1)} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === (list.length - 1) ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↓</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '8px', marginBottom: '4px' }}>Pinned Quick Add IDs (comma-separated)</div>
                  <input
                    className="nodrag"
                    value={(uiPresetDraft.palette.pinned || []).join(', ')}
                    onChange={(e) => updatePinnedList(e.target.value)}
                    placeholder="preset-terminal, preset-form"
                    style={{ width: '100%', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '6px', fontSize: '11px' }}
                  />
                </div>

                <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>Draft → Release Diff</div>
                  <div style={{ fontSize: '11px', opacity: 0.9, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px' }}>
                    <span>Theme tokens</span>
                    <span style={{ color: uiDraftDiff.themeChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.themeChanged ? 'changed' : 'unchanged'}</span>
                    <span>Sidebar tabs</span>
                    <span style={{ color: uiDraftDiff.tabsChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.tabsChanged ? 'changed' : 'unchanged'}</span>
                    <span>Palette categories</span>
                    <span style={{ color: uiDraftDiff.categoriesChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.categoriesChanged ? 'changed' : 'unchanged'}</span>
                    <span>Pinned IDs</span>
                    <span style={{ color: uiDraftDiff.pinnedChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.pinnedChanged ? 'changed' : 'unchanged'}</span>
                  </div>
                  {uiDraftValidationErrors.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--vscode-errorForeground)' }}>
                      {uiDraftValidationErrors.map((error, index) => (
                        <div key={`${error}-${index}`}>• {error}</div>
                      ))}
                    </div>
                  )}
                  {!uiDraftDiff.hasChanges && (
                    <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.75 }}>No changes detected between Draft and Release.</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button className="nodrag" onClick={saveThemeDraft} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Save Draft
                  </button>
                  <button className="nodrag" onClick={resetThemeDraft} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Reset
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button className="nodrag" onClick={exportTheme} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Export
                  </button>
                  <button className="nodrag" onClick={resetThemeDefaults} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Defaults
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    className="nodrag"
                    onClick={propagateThemeDraft}
                    disabled={!canPropagate}
                    style={{
                      flex: 1,
                      padding: '6px',
                      background: canPropagate ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-input-background)',
                      color: canPropagate ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
                      border: 'none',
                      cursor: canPropagate ? 'pointer' : 'not-allowed',
                      fontSize: '11px'
                    }}
                    title={canPropagate ? 'Propagate draft to release preset' : 'Fix validation errors or make changes before propagating'}
                  >
                    Propagate
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button className="nodrag" onClick={() => importTheme('paste')} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Import Paste
                  </button>
                  <button className="nodrag" onClick={() => importTheme('file')} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
                    Import File
                  </button>
                </div>
                <textarea
                  className="nodrag"
                  value={themeImportJson}
                  onChange={(e) => setThemeImportJson(e.target.value)}
                  placeholder='{"version":1,"theme":{"tokens":{...}},"sidebar":{"tabs":[...]},"palette":{"categories":[...],"pinned":[...]}}'
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    minHeight: '70px',
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    padding: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--vscode-editor-font-family, monospace)'
                  }}
                />
                {themeExportJson && (
                  <textarea
                    className="nodrag"
                    readOnly
                    value={themeExportJson}
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      minHeight: '70px',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                      fontSize: '11px',
                      fontFamily: 'var(--vscode-editor-font-family, monospace)'
                    }}
                  />
                )}
                {themeError && (
                  <div style={{ marginTop: '8px', color: 'var(--vscode-errorForeground)', fontSize: '11px' }}>
                    {themeError}
                  </div>
                )}
                {uiPropagateSummary && (
                  <div style={{ marginTop: '8px', color: 'var(--vscode-textLink-foreground)', fontSize: '11px' }}>
                    {uiPropagateSummary}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
              <button
                className="nodrag"
                onClick={startNewDraft}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                + New
              </button>
              <button
                className="nodrag"
                onClick={saveDraft}
                disabled={!studioDraft}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: studioDraft ? 'var(--vscode-button-background)' : 'transparent',
                  color: studioDraft ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                  border: studioDraft ? 'none' : '1px solid var(--vscode-panel-border)',
                  cursor: studioDraft ? 'pointer' : 'not-allowed',
                  fontSize: '11px',
                  opacity: studioDraft ? 1 : 0.6
                }}
              >
                Save
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                className="nodrag"
                onClick={() => exportSelectedOrAll(studioSelectedId ? 'one' : 'all')}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
                title="Export JSON (copies to clipboard)"
              >
                Export
              </button>
              <button
                className="nodrag"
                onClick={importFromFile}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
                title="Import JSON from file"
              >
                Import File
              </button>
            </div>

            {studioError && (
              <div style={{ color: 'var(--vscode-errorForeground)', fontSize: '11px', marginBottom: '8px' }}>
                {studioError}
              </div>
            )}
            {studioImportSummary && (
              <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>
                {studioImportSummary}
              </div>
            )}

            <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>Existing</div>
            <div className="sidebar-list" style={{ marginBottom: '12px' }}>
              {customNodes.length === 0 && (
                <div style={{ opacity: 0.6, fontSize: '12px', padding: '6px 0' }}>No custom nodes yet.</div>
              )}
              {customNodes.map((n: any) => {
                const nid = String(n?.id || '');
                const selected = studioSelectedId === nid;
                return (
                  <div
                    key={nid}
                    onClick={() => selectDraft(nid)}
                    draggable
                    onDragStart={(event) => onDragStartCustomNode(event, nid)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: selected ? '1px solid var(--vscode-focusBorder)' : '1px solid transparent',
                      background: selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span className="codicon codicon-symbol-structure"></span>
                      <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {String(n?.title || nid)}
                      </span>
                    </div>
                    <button
                      className="nodrag"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDraft(nid);
                      }}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                    >
                      <span className="codicon codicon-trash"></span>
                    </button>
                  </div>
                );
              })}
            </div>

            {studioDraft && (
              <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Editor</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    className="nodrag"
                    placeholder="id (unique)"
                    value={String(studioDraft.id || '')}
                    onChange={(e) => setStudioDraft({ ...studioDraft, id: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    className="nodrag"
                    placeholder="title"
                    value={String(studioDraft.title || '')}
                    onChange={(e) => setStudioDraft({ ...studioDraft, title: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                      fontSize: '11px'
                    }}
                  />

                  <div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Intent</div>
                    <input
                      className="nodrag"
                      list="studio-intents"
                      placeholder="intent (e.g. git.checkout)"
                      value={String(studioDraft.intent || '')}
                      onChange={(e) => setStudioDraft({ ...studioDraft, intent: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        fontSize: '11px'
                      }}
                    />
                    <datalist id="studio-intents">
                      {allCapabilities.map((cap) => (
                        <option key={cap} value={cap} />
                      ))}
                    </datalist>
                  </div>

                  <div style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.85 }}>Schema</div>
                      <button
                        className="nodrag"
                        onClick={() => setStudioDraft({ ...studioDraft, schema: [...(studioDraft.schema || []), { name: '', type: 'string' }] })}
                        style={{
                          background: 'none',
                          border: '1px solid var(--vscode-panel-border)',
                          color: 'var(--vscode-foreground)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        + Field
                      </button>
                    </div>

                    {(studioDraft.schema || []).map((f: SchemaField, i: number) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 1fr 24px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                        <input
                          className="nodrag"
                          placeholder="name"
                          value={String(f?.name || '')}
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            next[i] = { ...next[i], name: e.target.value };
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        />
                        <select
                          className="nodrag"
                          value={String(f?.type || 'string')}
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            next[i] = { ...next[i], type: e.target.value as any };
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        >
                          <option value="string">string</option>
                          <option value="boolean">boolean</option>
                          <option value="enum">enum</option>
                          <option value="path">path</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                          <input
                            className="nodrag"
                            type="checkbox"
                            checked={!!f?.required}
                            onChange={(e) => {
                              const next = [...(studioDraft.schema || [])];
                              next[i] = { ...next[i], required: e.target.checked };
                              setStudioDraft({ ...studioDraft, schema: next });
                            }}
                          />
                          req
                        </label>
                        <input
                          className="nodrag"
                          placeholder="default / options (enum: a,b,c)"
                          value={
                            f?.type === 'enum'
                              ? (Array.isArray(f?.options) ? (f?.options as any[]).join(',') : String(f?.options || ''))
                              : (f?.default !== undefined ? String(f?.default) : '')
                          }
                          onChange={(e) => {
                            const next = [...(studioDraft.schema || [])];
                            if (String(next[i]?.type) === 'enum') {
                              const raw = e.target.value;
                              next[i] = { ...next[i], options: raw.split(',').map(s => s.trim()).filter(Boolean) };
                            } else {
                              next[i] = { ...next[i], default: e.target.value };
                            }
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          style={{
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            padding: '4px',
                            fontSize: '11px'
                          }}
                        />
                        <button
                          className="nodrag"
                          onClick={() => {
                            const next = [...(studioDraft.schema || [])];
                            next.splice(i, 1);
                            setStudioDraft({ ...studioDraft, schema: next });
                          }}
                          title="Remove"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ fontSize: '10px', opacity: 0.65 }}>Mapping defaults to identity if left empty.</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Mapping (JSON)</div>
                    <textarea
                      className="nodrag"
                      value={studioMappingJson}
                      onChange={(e) => setStudioMappingJson(e.target.value)}
                      placeholder='{ "payloadKey": "fieldName" }'
                      style={{
                        width: '100%',
                        minHeight: '90px',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--vscode-editor-font-family, monospace)'
                      }}
                    />
                  </div>

                  <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Import (paste JSON)</div>
                    <textarea
                      className="nodrag"
                      value={studioImportJson}
                      onChange={(e) => setStudioImportJson(e.target.value)}
                      placeholder='{"version":1,"nodes":[...]}'
                      style={{
                        width: '100%',
                        minHeight: '90px',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--vscode-editor-font-family, monospace)'
                      }}
                    />
                    <button
                      className="nodrag"
                      onClick={importFromPaste}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '6px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      Import Paste
                    </button>
                  </div>

                  {studioExportJson && (
                    <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Last Export</div>
                      <textarea
                        className="nodrag"
                        readOnly
                        value={studioExportJson}
                        style={{
                          width: '100%',
                          minHeight: '90px',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '6px',
                          fontSize: '11px',
                          fontFamily: 'var(--vscode-editor-font-family, monospace)'
                        }}
                      />
                      <div style={{ fontSize: '10px', opacity: 0.65 }}>Copied to clipboard on export.</div>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Preview</div>
                    <SchemaArgsForm
                      nodeId="studio-preview"
                      fields={[...(studioDraft.schema || []), { name: 'description', type: 'string', description: 'Step description for logs' }]}
                      values={studioPreviewValues}
                      onChange={(name, value) => setStudioPreviewValues((prev) => ({ ...prev, [name]: value }))}
                      availableVars={[]}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'environment' && (
            <div style={{ padding: '0 8px' }}>
                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
                    Workspace Environment Variables (injected into terminal & variables)
                </div>
                {envVars.map((v, i) => (
                    <div key={i} style={{ marginBottom: '8px', border: '1px solid var(--vscode-widget-border)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                            <input
                                type="text"
                                placeholder="Key"
                                aria-label="Environment variable key"
                                value={v.key}
                                onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                                onBlur={handleBlur}
                                style={{
                                    flex: 1,
                                    background: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    padding: '4px',
                                    fontSize: '11px'
                                }}
                            />
                             <button
                                onClick={() => removeEnvVar(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                                title="Delete"
                                aria-label="Delete environment variable"
                            >
                                <span className="codicon codicon-trash"></span>
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                             <input
                                type={v.visible ? "text" : "password"}
                                placeholder="Value"
                                aria-label="Environment variable value"
                                value={v.value}
                                onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                                onBlur={handleBlur}
                                style={{
                                    flex: 1,
                                    background: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    padding: '4px',
                                    fontSize: '11px'
                                }}
                            />
                            <button
                                onClick={() => toggleVisibility(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-foreground)' }}
                                title={v.visible ? "Hide" : "Show"}
                                aria-label={v.visible ? "Hide value" : "Show value"}
                            >
                                <span className={`codicon ${v.visible ? 'codicon-eye-closed' : 'codicon-eye'}`}></span>
                            </button>
                        </div>
                    </div>
                ))}
                <button
                    onClick={addEnvVar}
                    style={{
                        width: '100%',
                        padding: '6px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                >
                    + Add Variable
                </button>
            </div>
        )}
      </div>

      <div className="sidebar-footer">
        {activeView === 'history' && (
            <button
                onClick={clearHistory}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--vscode-textLink-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px'
                }}
            >
                <span className="codicon codicon-trash"></span>
                Clear History
            </button>
        )}
         {activeView === 'providers' && (
            <>
                <span className="codicon codicon-info"></span>
                <span>Drag items · Ctrl+Shift+S focus search</span>
            </>
        )}
      </div>
    </aside>
  );
}


import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import {
  defaultThemeTokens,
  normalizeThemeTokens,
  normalizeUiPreset,
  SidebarTabPreset,
  UiPreset
} from '../types/theme';

type UiDraftDiff = {
  themeChanged: boolean;
  tabsChanged: boolean;
  categoriesChanged: boolean;
  pinnedChanged: boolean;
  hasChanges: boolean;
};

type UseUiPresetSidebarStateParams = {
  uiPreset?: UiPreset;
  uiPresetRelease?: UiPreset;
  adminMode: boolean;
};

type UseUiPresetSidebarStateResult = {
  uiPresetDraft: UiPreset;
  setUiPresetDraft: Dispatch<SetStateAction<UiPreset>>;
  themeExportJson: string;
  themeImportJson: string;
  setThemeImportJson: Dispatch<SetStateAction<string>>;
  themeError: string;
  uiPropagateSummary: string;
  releasePreset: UiPreset;
  setThemeToken: (path: string, value: string) => void;
  saveThemeDraft: () => void;
  resetThemeDraft: () => void;
  exportTheme: () => void;
  importTheme: (source: 'paste' | 'file') => void;
  resetThemeDefaults: () => void;
  propagateThemeDraft: () => void;
  updateSidebarTabField: (id: string, patch: Partial<SidebarTabPreset>) => void;
  moveSidebarTab: (id: string, direction: -1 | 1) => void;
  addSidebarTab: () => void;
  removeSidebarTab: (id: string) => void;
  updatePaletteCategory: (id: string, patch: Record<string, unknown>) => void;
  movePaletteCategory: (id: string, direction: -1 | 1) => void;
  updatePinnedList: (raw: string) => void;
  uiDraftValidationErrors: string[];
  uiDraftDiff: UiDraftDiff;
  canPropagate: boolean;
};

export function useUiPresetSidebarState({
  uiPreset,
  uiPresetRelease,
  adminMode
}: UseUiPresetSidebarStateParams): UseUiPresetSidebarStateResult {
  const [uiPresetDraft, setUiPresetDraft] = useState<UiPreset>(() =>
    normalizeUiPreset(window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } })
  );
  const [themeExportJson, setThemeExportJson] = useState<string>('');
  const [themeImportJson, setThemeImportJson] = useState<string>('');
  const [themeError, setThemeError] = useState<string>('');
  const [uiPropagateSummary, setUiPropagateSummary] = useState<string>('');
  const [releasePreset, setReleasePreset] = useState<UiPreset>(() =>
    normalizeUiPreset(window.initialData?.uiPresetRelease || window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } })
  );

  useEffect(() => {
    if (!uiPreset) return;
    setUiPresetDraft(normalizeUiPreset(uiPreset));
  }, [uiPreset]);

  useEffect(() => {
    if (!uiPresetRelease) return;
    setReleasePreset(normalizeUiPreset(uiPresetRelease));
  }, [uiPresetRelease]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isInboundMessage(event.data)) return;

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
    const message: WebviewOutboundMessage = { type: 'uiPreset.saveDraft', uiPreset: uiPresetDraft };
    window.vscode.postMessage(message);
  };

  const resetThemeDraft = () => {
    if (!window.vscode) return;
    setThemeError('');
    const message: WebviewOutboundMessage = { type: 'uiPreset.resetDraft' };
    window.vscode.postMessage(message);
  };

  const exportTheme = () => {
    if (!window.vscode) return;
    const message: WebviewOutboundMessage = { type: 'uiPreset.exportCurrent' };
    window.vscode.postMessage(message);
  };

  const importTheme = (source: 'paste' | 'file') => {
    if (!window.vscode) return;
    setThemeError('');
    const message: WebviewOutboundMessage = {
      type: 'uiPreset.importDraft',
      source,
      jsonText: source === 'paste' ? themeImportJson : undefined
    };
    window.vscode.postMessage(message);
  };

  const resetThemeDefaults = () => {
    if (!window.vscode) return;
    setThemeError('');
    const message: WebviewOutboundMessage = { type: 'uiPreset.resetToDefaults' };
    window.vscode.postMessage(message);
  };

  const propagateThemeDraft = () => {
    if (!window.vscode) return;
    setThemeError('');
    setUiPropagateSummary('');
    const message: WebviewOutboundMessage = { type: 'uiPreset.propagateDraft' };
    window.vscode.postMessage(message);
  };

  const updateSidebarTabs = (nextTabs: SidebarTabPreset[]) => {
    const normalized = normalizeUiPreset({
      ...uiPresetDraft,
      sidebar: { tabs: nextTabs },
      palette: uiPresetDraft.palette,
      theme: uiPresetDraft.theme
    });
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

  const updatePaletteCategory = (id: string, patch: Record<string, unknown>) => {
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

  return {
    uiPresetDraft,
    setUiPresetDraft,
    themeExportJson,
    themeImportJson,
    setThemeImportJson,
    themeError,
    uiPropagateSummary,
    releasePreset,
    setThemeToken,
    saveThemeDraft,
    resetThemeDraft,
    exportTheme,
    importTheme,
    resetThemeDefaults,
    propagateThemeDraft,
    updateSidebarTabField,
    moveSidebarTab,
    addSidebarTab,
    removeSidebarTab,
    updatePaletteCategory,
    movePaletteCategory,
    updatePinnedList,
    uiDraftValidationErrors,
    uiDraftDiff,
    canPropagate
  };
}

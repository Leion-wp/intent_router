import React, { useDeferredValue, useMemo, useState, useEffect, useRef } from 'react';
import { WebviewOutboundMessage } from './types/messages';
import { normalizeUiPreset, SidebarTabPreset, SidebarTabType, UiPreset } from './types/theme';
import ProvidersPanel from './components/sidebar/ProvidersPanel';
import HistoryPanel from './components/sidebar/HistoryPanel';
import SidebarTabs from './components/sidebar/SidebarTabs';
import EnvironmentPanel from './components/sidebar/EnvironmentPanel';
import SidebarFooter from './components/sidebar/SidebarFooter';
import StudioAdminPanel from './components/sidebar/StudioAdminPanel';
import StudioNodesPanel from './components/sidebar/StudioNodesPanel';
import { useStudioSidebarState } from './hooks/useStudioSidebarState';
import { useUiPresetSidebarState } from './hooks/useUiPresetSidebarState';
import { useSidebarEnvironmentState } from './hooks/useSidebarEnvironmentState';
import { useProvidersCatalogState } from './hooks/useProvidersCatalogState';
import { computeHistoryWindow, filterHistoryRuns } from './utils/historyListUtils';

type SidebarProps = {
  history?: any[];
  onSelectHistory?: (run: any) => void;
  onRestoreHistory?: (run: any) => void;
  onResumeHistory?: (run: any, startStepId: string) => void;
  onExportRunAudit?: (runId: string) => void;
  adminMode?: boolean;
  tab?: string;
  onTabChange?: (tab: string) => void;
  tabs?: SidebarTabPreset[];
  uiPreset?: UiPreset;
  uiPresetRelease?: UiPreset;
};

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

function Sidebar({
  history = [],
  onSelectHistory,
  onRestoreHistory,
  onResumeHistory,
  onExportRunAudit,
  adminMode = false,
  tab: tabProp,
  onTabChange,
  tabs = [],
  uiPreset,
  uiPresetRelease
}: SidebarProps) {
  const [internalTab, setInternalTab] = useState<string>('nodes');
  const tab = tabProp ?? internalTab;
  const setTab = (next: string) => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  const {
    envVars,
    updateEnvVar,
    toggleVisibility,
    removeEnvVar,
    handleBlur,
    addEnvVar
  } = useSidebarEnvironmentState();
  const {
    customNodes,
    studioSelectedId,
    studioDraft,
    setStudioDraft,
    studioMappingJson,
    setStudioMappingJson,
    studioPreviewValues,
    setStudioPreviewValues,
    studioError,
    studioExportJson,
    studioImportJson,
    setStudioImportJson,
    studioImportSummary,
    allCapabilities,
    startNewDraft,
    selectDraft,
    saveDraft,
    deleteDraft,
    exportSelectedOrAll,
    importFromPaste,
    importFromFile,
    retryLastAction: retryStudioAction,
    clearFeedback: clearStudioFeedback,
    canRetryLastAction: canRetryStudioAction
  } = useStudioSidebarState();
  const {
    uiPresetDraft,
    themeExportJson,
    themeImportJson,
    setThemeImportJson,
    themeError,
    uiPropagateSummary,
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
    canPropagate,
    retryLastAction: retryThemeAction,
    clearFeedback: clearThemeFeedback,
    canRetryLastAction: canRetryThemeAction
  } = useUiPresetSidebarState({ uiPreset, uiPresetRelease, adminMode });
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyScrollTop, setHistoryScrollTop] = useState<number>(0);
  const [historyViewportHeight, setHistoryViewportHeight] = useState<number>(360);
  const historyScrollRafRef = useRef<number | null>(null);
  const historySearchPersistTimerRef = useRef<number | null>(null);
  const pendingHistoryScrollTopRef = useRef<number>(0);
  const historyContainerRef = useRef<HTMLDivElement | null>(null);
  const deferredHistorySearch = useDeferredValue(historySearch);
  const devMode = !!window.initialData?.devMode;

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

  const {
    providersSearchRef,
    providersSearch,
    setProvidersSearch,
    providersFilter,
    setProvidersFilter,
    catalogBySection,
    renderCatalogSection
  } = useProvidersCatalogState({
    customNodes: customNodes.map((node) => ({ id: node.id, title: node.title })),
    onDragStart,
    onDragStartCustomNode
  });

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
    try {
      const state = window.vscode?.getState?.() || {};
      if (typeof state.historySearch === 'string') {
        setHistorySearch(state.historySearch);
      }
    } catch {
      // ignore persisted UI state errors
    }
  }, []);

  useEffect(() => {
    try {
      if (historySearchPersistTimerRef.current !== null) {
        clearTimeout(historySearchPersistTimerRef.current);
      }
      historySearchPersistTimerRef.current = window.setTimeout(() => {
        const prev = window.vscode?.getState?.() || {};
        window.vscode?.setState?.({
          ...prev,
          historySearch
        });
        historySearchPersistTimerRef.current = null;
      }, 120);
    } catch {
      // ignore
    }
    return () => {
      if (historySearchPersistTimerRef.current !== null) {
        clearTimeout(historySearchPersistTimerRef.current);
        historySearchPersistTimerRef.current = null;
      }
    };
  }, [historySearch]);

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
    if (effectiveTabs.length === 0) return;
    if (!effectiveTabs.some(entry => entry.id === tab)) {
      setTab(effectiveTabs[0].id);
    }
  }, [effectiveTabs, tab]);

  const clearHistory = () => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'clearHistory' };
    window.vscode.postMessage(msg);
  };

  const openExternal = (url: string) => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'openExternal', url };
    window.vscode.postMessage(msg);
  };

  const copyToClipboard = (text: string) => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'copyToClipboard', text };
    window.vscode.postMessage(msg);
  };

  const exportRunAudit = (runId: string) => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'exportRunAudit', runId };
    window.vscode.postMessage(msg);
    onExportRunAudit?.(runId);
  };

  const fetchPrChecks = (url: string) => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'githubPrChecks', url };
    window.vscode.postMessage(msg);
  };

  const rerunPrChecks = (url: string) => {
    if (!window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'githubPrRerunFailed', url };
    window.vscode.postMessage(msg);
  };

  const commentPr = (url: string) => {
    const body = window.prompt('PR comment');
    if (!body || !window.vscode) return;
    const msg: WebviewOutboundMessage = { type: 'githubPrComment', url, body };
    window.vscode.postMessage(msg);
  };

  useEffect(() => {
    return () => {
      if (historyScrollRafRef.current !== null) {
        cancelAnimationFrame(historyScrollRafRef.current);
        historyScrollRafRef.current = null;
      }
    };
  }, []);

  const handleHistoryScroll = (top: number) => {
    pendingHistoryScrollTopRef.current = top;
    if (historyScrollRafRef.current !== null) return;
    historyScrollRafRef.current = requestAnimationFrame(() => {
      historyScrollRafRef.current = null;
      setHistoryScrollTop(pendingHistoryScrollTopRef.current);
    });
  };

  const filteredHistory = useMemo(
    () => filterHistoryRuns(history, deferredHistorySearch),
    [deferredHistorySearch, history]
  );

  const HISTORY_ROW_HEIGHT = 176;
  const HISTORY_OVERSCAN = 6;
  const historyTotalHeight = filteredHistory.length * HISTORY_ROW_HEIGHT;
  const {
    startIndex: historyStartIndex,
    endIndex: historyEndIndex
  } = computeHistoryWindow({
    total: filteredHistory.length,
    scrollTop: historyScrollTop,
    viewportHeight: historyViewportHeight,
    rowHeight: HISTORY_ROW_HEIGHT,
    overscan: HISTORY_OVERSCAN
  });
  const historyWindow = filteredHistory.slice(historyStartIndex, historyEndIndex);

  return (
    <aside className="sidebar">
      <SidebarTabs effectiveTabs={effectiveTabs} activeTabId={tab} onSelectTab={setTab} />

      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="sidebar-content"
        style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
      >
        {activeView === 'providers' && (
          <ProvidersPanel
            providersSearchRef={providersSearchRef}
            providersSearch={providersSearch}
            onProvidersSearchChange={setProvidersSearch}
            providersFilter={providersFilter}
            onProvidersFilterChange={setProvidersFilter}
            catalogBySection={catalogBySection}
            renderCatalogSection={renderCatalogSection}
            devMode={devMode}
            onOpenStudio={() => {
              const studioTab = effectiveTabs.find(entry => entry.type === 'studio' || entry.type === 'importExport');
              if (studioTab) setTab(studioTab.id);
            }}
          />
        )}

        {activeView === 'history' && (
          <HistoryPanel
            historySearch={historySearch}
            onHistorySearchChange={setHistorySearch}
            filteredHistory={filteredHistory}
            historyContainerRef={historyContainerRef}
            onHistoryViewportUpdate={(el) => {
              if (el) {
                setHistoryViewportHeight(Math.max(180, el.clientHeight || 360));
              }
            }}
            onHistoryScroll={handleHistoryScroll}
            historyTotalHeight={historyTotalHeight}
            historyStartIndex={historyStartIndex}
            historyWindow={historyWindow}
            historyRowHeight={HISTORY_ROW_HEIGHT}
            onSelectHistory={onSelectHistory}
            onRestoreHistory={onRestoreHistory}
            onResumeHistory={onResumeHistory}
            onOpenExternal={openExternal}
            onCopyToClipboard={copyToClipboard}
            onExportRunAudit={exportRunAudit}
            onFetchPrChecks={fetchPrChecks}
            onRerunPrChecks={rerunPrChecks}
            onCommentPr={commentPr}
          />
        )}

        {activeView === 'studio' && (
          <div style={{ padding: '0 8px' }}>
            {adminMode && (
              <StudioAdminPanel
                uiPresetDraft={uiPresetDraft}
                setThemeToken={setThemeToken}
                updateSidebarTabField={updateSidebarTabField}
                moveSidebarTab={moveSidebarTab}
                removeSidebarTab={removeSidebarTab}
                addSidebarTab={addSidebarTab}
                updatePaletteCategory={updatePaletteCategory}
                movePaletteCategory={movePaletteCategory}
                updatePinnedList={updatePinnedList}
                uiDraftDiff={uiDraftDiff}
                uiDraftValidationErrors={uiDraftValidationErrors}
                saveThemeDraft={saveThemeDraft}
                resetThemeDraft={resetThemeDraft}
                exportTheme={exportTheme}
                resetThemeDefaults={resetThemeDefaults}
                propagateThemeDraft={propagateThemeDraft}
                canPropagate={canPropagate}
                importTheme={importTheme}
                themeImportJson={themeImportJson}
                setThemeImportJson={setThemeImportJson}
                themeExportJson={themeExportJson}
                themeError={themeError}
                uiPropagateSummary={uiPropagateSummary}
                retryLastAction={retryThemeAction}
                clearFeedback={clearThemeFeedback}
                canRetryLastAction={canRetryThemeAction}
              />
            )}

            <StudioNodesPanel
              customNodes={customNodes}
              studioSelectedId={studioSelectedId}
              studioDraft={studioDraft}
              setStudioDraft={setStudioDraft}
              studioMappingJson={studioMappingJson}
              setStudioMappingJson={setStudioMappingJson}
              studioPreviewValues={studioPreviewValues}
              setStudioPreviewValues={setStudioPreviewValues}
              studioError={studioError}
              studioExportJson={studioExportJson}
              studioImportJson={studioImportJson}
              setStudioImportJson={setStudioImportJson}
              studioImportSummary={studioImportSummary}
              allCapabilities={allCapabilities}
              startNewDraft={startNewDraft}
              saveDraft={saveDraft}
              exportSelectedOrAll={exportSelectedOrAll}
              importFromFile={importFromFile}
              importFromPaste={importFromPaste}
              retryLastAction={retryStudioAction}
              clearFeedback={clearStudioFeedback}
              canRetryLastAction={canRetryStudioAction}
              selectDraft={selectDraft}
              deleteDraft={deleteDraft}
              onDragStartCustomNode={onDragStartCustomNode}
            />
          </div>
        )}

        {activeView === 'environment' && (
          <EnvironmentPanel
            envVars={envVars}
            updateEnvVar={updateEnvVar}
            toggleVisibility={toggleVisibility}
            removeEnvVar={removeEnvVar}
            handleBlur={handleBlur}
            addEnvVar={addEnvVar}
          />
        )}
      </div>

      <SidebarFooter activeView={activeView} clearHistory={clearHistory} />
    </aside>
  );
}

export default React.memo(Sidebar);

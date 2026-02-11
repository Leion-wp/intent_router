import { Dispatch, MutableRefObject, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { applyThemeTokensToRoot, defaultThemeTokens, normalizeUiPreset, SidebarTabPreset, UiPreset } from '../types/theme';

const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;

type UseAppShellStateResult = {
  commandGroups: any[];
  history: any[];
  selectedRun: any;
  setSelectedRun: Dispatch<SetStateAction<any>>;
  restoreRun: any;
  uiPreset: UiPreset;
  uiPresetRelease: UiPreset;
  adminMode: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  sidebarWidth: number;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  sidebarTab: string;
  setSidebarTab: Dispatch<SetStateAction<string>>;
  visibleSidebarTabs: SidebarTabPreset[];
  onRestoreHistory: (run: any) => void;
  onRestoreHandled: () => void;
  sidebarResizeRef: MutableRefObject<{ startX: number; startWidth: number } | null>;
  defaultSidebarWidth: number;
  minSidebarWidth: number;
  maxSidebarWidth: number;
};

export function useAppShellState(): UseAppShellStateResult {
  const initialPreset = normalizeUiPreset(window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } });
  const [commandGroups, setCommandGroups] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [restoreRun, setRestoreRun] = useState<any>(null);
  const [uiPreset, setUiPreset] = useState<UiPreset>(() => initialPreset);
  const [uiPresetRelease, setUiPresetRelease] = useState<UiPreset>(() => normalizeUiPreset(window.initialData?.uiPresetRelease || initialPreset));
  const [adminMode, setAdminMode] = useState<boolean>(!!window.initialData?.adminMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarTab, setSidebarTab] = useState<string>(() => {
    const firstVisible = initialPreset.sidebar.tabs.find(tab => tab.visible);
    return firstVisible?.id || initialPreset.sidebar.tabs[0]?.id || 'nodes';
  });
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const visibleSidebarTabs = useMemo(
    () => (uiPreset.sidebar.tabs || []).filter(tab => tab.visible !== false),
    [uiPreset]
  );

  useEffect(() => {
    try {
      const state = window.vscode?.getState?.() || {};
      if (typeof state.sidebarCollapsed === 'boolean') setSidebarCollapsed(state.sidebarCollapsed);
      if (typeof state.sidebarTab === 'string' && state.sidebarTab.trim()) {
        setSidebarTab(state.sidebarTab.trim());
      }
      if (typeof state.sidebarWidth === 'number' && Number.isFinite(state.sidebarWidth)) {
        setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, state.sidebarWidth)));
      }
    } catch {
      // ignore
    }

    if (window.initialData) {
      if (window.initialData.commandGroups) {
        setCommandGroups(window.initialData.commandGroups);
      }
      if (window.initialData.history) {
        setHistory(window.initialData.history);
      }
      if (window.initialData.uiPreset) {
        setUiPreset(normalizeUiPreset(window.initialData.uiPreset));
      }
      if (window.initialData.uiPresetRelease) {
        setUiPresetRelease(normalizeUiPreset(window.initialData.uiPresetRelease));
      }
      if (typeof window.initialData.adminMode === 'boolean') {
        setAdminMode(!!window.initialData.adminMode);
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'historyUpdate') {
        setHistory(event.data.history);
        if (event.data.history.length === 0) {
          setSelectedRun(null);
        }
      } else if (event.data?.type === 'uiPresetUpdate') {
        setUiPreset(normalizeUiPreset(event.data.uiPreset));
      } else if (event.data?.type === 'uiPresetReleaseUpdate') {
        setUiPresetRelease(normalizeUiPreset(event.data.uiPreset));
      } else if (event.data?.type === 'adminModeUpdate') {
        setAdminMode(!!event.data.adminMode);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarCollapsed((value) => !value);
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('intentRouter.focusSidebarSearch'));
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('intentRouter.openQuickAdd'));
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        const digit = Number.parseInt(event.key, 10);
        if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
          const targetTab = visibleSidebarTabs[digit - 1];
          if (targetTab) {
            event.preventDefault();
            setSidebarTab(targetTab.id);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleSidebarTabs]);

  useEffect(() => {
    if (visibleSidebarTabs.length === 0) return;
    const stillExists = visibleSidebarTabs.some(tab => tab.id === sidebarTab);
    if (!stillExists) {
      setSidebarTab(visibleSidebarTabs[0].id);
    }
  }, [visibleSidebarTabs, sidebarTab]);

  useEffect(() => {
    try {
      const prev = window.vscode?.getState?.() || {};
      window.vscode?.setState?.({ ...prev, sidebarCollapsed, sidebarTab, sidebarWidth });
    } catch {
      // ignore
    }
  }, [sidebarCollapsed, sidebarTab, sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = sidebarResizeRef.current;
      if (!drag || sidebarCollapsed) return;
      const delta = event.clientX - drag.startX;
      const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, drag.startWidth + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      sidebarResizeRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    applyThemeTokensToRoot(uiPreset.theme.tokens);
  }, [uiPreset.theme.tokens]);

  const onRestoreHistory = (run: any) => {
    setRestoreRun(run);
    setSelectedRun(null);
  };

  const onRestoreHandled = () => {
    setRestoreRun(null);
  };

  return {
    commandGroups,
    history,
    selectedRun,
    setSelectedRun,
    restoreRun,
    uiPreset,
    uiPresetRelease,
    adminMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    sidebarTab,
    setSidebarTab,
    visibleSidebarTabs,
    onRestoreHistory,
    onRestoreHandled,
    sidebarResizeRef,
    defaultSidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    minSidebarWidth: MIN_SIDEBAR_WIDTH,
    maxSidebarWidth: MAX_SIDEBAR_WIDTH
  };
}

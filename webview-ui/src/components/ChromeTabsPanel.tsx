import React, { useEffect, useState, useCallback } from 'react';
import ChromeLiveViewer from './ChromeLiveViewer';

// ============================================
// CHROME TABS PANEL
// Full-page WebView for Chrome tabs/workspaces
// Rendered when window.initialData.mode === 'chromeTabs'
// ============================================

export interface ChromeTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active?: boolean;
  discarded?: boolean;
}

interface ChromeWorkspace {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  tabIds: number[];
}

interface ChromeState {
  connected: boolean;
  tabs: ChromeTab[];
  workspaces: ChromeWorkspace[];
  activeTabId: number | null;
  lastUpdated: number | null;
}

const vscode = window.vscode;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getTabsForWorkspace(ws: ChromeWorkspace, tabs: ChromeTab[]): ChromeTab[] {
  return ws.tabIds.map(id => tabs.find(t => t.id === id)).filter(Boolean) as ChromeTab[];
}

function getUnsortedTabs(workspaces: ChromeWorkspace[], tabs: ChromeTab[]): ChromeTab[] {
  const assigned = new Set(workspaces.flatMap(w => w.tabIds));
  return tabs.filter(t => !assigned.has(t.id));
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const ConnectedDot: React.FC<{ connected: boolean }> = ({ connected }) => (
  <span style={{
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: connected ? 'var(--ir-accent-success)' : 'rgba(255,255,255,0.25)',
    boxShadow: connected ? '0 0 6px var(--ir-accent-success)' : 'none',
    flexShrink: 0,
    transition: 'background 0.3s, box-shadow 0.3s'
  }} />
);

const TabRow: React.FC<{
  tab: ChromeTab;
  isActive: boolean;
  onSwitch: (id: number) => void;
  onClose: (id: number) => void;
  onViewLive: (tab: ChromeTab) => void;
}> = ({ tab, isActive, onSwitch, onClose, onViewLive }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 10px',
      borderRadius: 8,
      cursor: 'pointer',
      background: isActive ? 'rgba(0,162,255,0.12)' : 'transparent',
      border: isActive ? '1px solid rgba(0,162,255,0.3)' : '1px solid transparent',
      transition: 'all 0.15s ease',
      minWidth: 0
    }}
    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    onClick={() => onSwitch(tab.id)}
    title={tab.url}
  >
    {tab.favIconUrl ? (
      <img
        src={tab.favIconUrl}
        alt=""
        style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    ) : (
      <span className="codicon codicon-globe" style={{ fontSize: 13, opacity: 0.5, flexShrink: 0 }} />
    )}
    <span style={{
      flex: 1,
      fontSize: 12,
      color: isActive ? 'var(--ir-accent-primary)' : 'rgba(255,255,255,0.85)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontWeight: isActive ? 600 : 400
    }}>
      {tab.title || getDomain(tab.url)}
    </span>
    {tab.discarded && (
      <span title="Hibernated" style={{ fontSize: 10, opacity: 0.45, flexShrink: 0 }}>💤</span>
    )}
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onViewLive(tab); }}
      title="View live in VS Code"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.35)',
        cursor: 'pointer',
        padding: '0 2px',
        borderRadius: 4,
        fontSize: 13,
        lineHeight: 1,
        flexShrink: 0,
        opacity: 0,
        transition: 'opacity 0.15s'
      }}
      className="tab-live-btn"
    >
      <span className="codicon codicon-device-desktop" />
    </button>
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClose(tab.id); }}
      title="Close tab"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.35)',
        cursor: 'pointer',
        padding: '0 2px',
        borderRadius: 4,
        fontSize: 14,
        lineHeight: 1,
        flexShrink: 0,
        opacity: 0,
        transition: 'opacity 0.15s'
      }}
      className="tab-close-btn"
    >
      ×
    </button>
    <style>{`
      .tab-close-btn:hover { opacity: 1 !important; color: var(--ir-accent-error) !important; }
      div:hover > .tab-close-btn { opacity: 0.5 !important; }
      .tab-live-btn:hover { opacity: 1 !important; color: var(--ir-accent-primary) !important; }
      div:hover > .tab-live-btn { opacity: 0.5 !important; }
    `}</style>
  </div>
);

const WorkspaceSection: React.FC<{
  workspace: ChromeWorkspace;
  tabs: ChromeTab[];
  activeTabId: number | null;
  onSwitch: (id: number) => void;
  onClose: (id: number) => void;
  onOpenTabs: (wsId: string) => void;
  onViewLive: (tab: ChromeTab) => void;
}> = ({ workspace, tabs, activeTabId, onSwitch, onClose, onViewLive }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          borderRadius: 6,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.5, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
        <span style={{ fontSize: 13 }}>{workspace.icon || '📁'}</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: workspace.color || '#6366f1', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workspace.name}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
          {tabs.length}
        </span>
      </div>
      {!collapsed && (
        <div style={{ paddingLeft: 12 }}>
          {tabs.length === 0
            ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '4px 10px' }}>No tabs</div>
            : tabs.map(tab => (
              <TabRow
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSwitch={onSwitch}
                onClose={onClose}
                onViewLive={onViewLive}
              />
            ))
          }
        </div>
      )}
    </div>
  );
};

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function ChromeTabsPanel() {
  const [state, setState] = useState<ChromeState>({
    connected: false,
    tabs: [],
    workspaces: [],
    activeTabId: null,
    lastUpdated: null
  });
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'workspaces' | 'all'>('workspaces');
  const [viewingTab, setViewingTab] = useState<ChromeTab | null>(null);

  // ── Message handler (Bridge → VS Code → WebView) ──
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'chrome.connected':
          setState(s => ({ ...s, connected: true }));
          break;
        case 'chrome.disconnected':
          setState(s => ({ ...s, connected: false }));
          break;
        case 'chrome.tabs':
          setState(s => ({
            ...s,
            connected: true,
            tabs: msg.tabs ?? s.tabs,
            workspaces: msg.workspaces ?? s.workspaces,
            lastUpdated: Date.now()
          }));
          break;
        case 'chrome.tabActivated':
          setState(s => ({ ...s, activeTabId: msg.tab?.id ?? null }));
          break;
        case 'chrome.tabCreated':
          setState(s => ({
            ...s,
            tabs: s.tabs.some(t => t.id === msg.tab?.id) ? s.tabs : [...s.tabs, msg.tab],
            lastUpdated: Date.now()
          }));
          break;
        case 'chrome.tabRemoved':
          setState(s => ({
            ...s,
            tabs: s.tabs.filter(t => t.id !== msg.tabId),
            workspaces: s.workspaces.map(ws => ({ ...ws, tabIds: ws.tabIds.filter(id => id !== msg.tabId) })),
            lastUpdated: Date.now()
          }));
          break;
      }
    };
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, []);

  // ── Actions (WebView → VS Code extension → Bridge → Chrome) ──
  const sendIntent = useCallback((intent: string, payload: object = {}) => {
    vscode?.postMessage({ type: 'chromeBridge.send', intent, ...payload });
  }, []);

  const refresh = useCallback(() => {
    vscode?.postMessage({ type: 'chromeBridge.getTabs' });
  }, []);

  const switchToTab = useCallback((tabId: number) => {
    sendIntent('chrome.openTab', { tabId });
  }, [sendIntent]);

  const closeTab = useCallback((tabId: number) => {
    sendIntent('chrome.closeTab', { tabId });
  }, [sendIntent]);

  const openNewTab = useCallback(() => {
    sendIntent('chrome.openTab', { url: 'chrome://newtab', active: true });
  }, [sendIntent]);

  // ── Filtered tabs ──
  const q = filter.trim().toLowerCase();
  const filteredTabs = q
    ? state.tabs.filter(t => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q))
    : state.tabs;
  const filteredWorkspaces = state.workspaces.map(ws => ({
    ...ws,
    filteredTabs: q
      ? getTabsForWorkspace(ws, state.tabs).filter(t => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q))
      : getTabsForWorkspace(ws, state.tabs)
  }));
  const unsorted = q ? filteredTabs.filter(t => !state.workspaces.some(ws => ws.tabIds.includes(t.id))) : getUnsortedTabs(state.workspaces, state.tabs);

  // ── Live viewer ──
  if (viewingTab) {
    return (
      <ChromeLiveViewer
        tabId={viewingTab.id}
        tab={viewingTab}
        onClose={() => setViewingTab(null)}
      />
    );
  }

  // ── Render ──
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--ir-glass-bg)',
      color: 'rgba(255,255,255,0.9)',
      fontFamily: 'var(--vscode-font-family, system-ui, sans-serif)',
      fontSize: 13,
      overflow: 'hidden'
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 14px 10px',
        background: 'rgba(0,0,0,0.25)',
        borderBottom: '1px solid var(--ir-glass-border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🌐</span>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>Chrome Tabs</span>
          <ConnectedDot connected={state.connected} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>
            {state.connected ? 'connected' : 'disconnected'}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            style={btnStyle}
          >
            <span className="codicon codicon-refresh" style={{ fontSize: 13 }} />
          </button>
          <button
            type="button"
            onClick={openNewTab}
            title="New Tab"
            style={btnStyle}
          >
            <span className="codicon codicon-add" style={{ fontSize: 13 }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span className="codicon codicon-search" style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none'
          }} />
          <input
            type="text"
            placeholder="Filter tabs…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '5px 8px 5px 28px',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 12,
              outline: 'none'
            }}
          />
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {(['workspaces', 'all'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                background: view === v ? 'var(--ir-accent-primary)' : 'rgba(255,255,255,0.06)',
                border: '1px solid ' + (view === v ? 'var(--ir-accent-primary)' : 'rgba(255,255,255,0.1)'),
                borderRadius: 6,
                color: '#fff',
                fontSize: 11,
                fontWeight: view === v ? 600 : 400,
                padding: '3px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {v === 'workspaces' ? '📂 Workspaces' : `🗂 All (${state.tabs.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>

        {!state.connected && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Chrome not connected</div>
            <div style={{ fontSize: 11 }}>
              Open the Chrome extension and check the Hub tab — the bridge connects automatically.
            </div>
          </div>
        )}

        {state.connected && view === 'workspaces' && (
          <>
            {filteredWorkspaces.filter(ws => ws.filteredTabs.length > 0 || !q).map(ws => (
              <WorkspaceSection
                key={ws.id}
                workspace={ws}
                tabs={ws.filteredTabs}
                activeTabId={state.activeTabId}
                onSwitch={switchToTab}
                onClose={closeTab}
                onOpenTabs={() => {}}
                onViewLive={setViewingTab}
              />
            ))}
            {unsorted.length > 0 && (
              <WorkspaceSection
                workspace={{ id: '__unsorted__', name: 'Unsorted', icon: '📋', tabIds: unsorted.map(t => t.id) }}
                tabs={unsorted}
                activeTabId={state.activeTabId}
                onSwitch={switchToTab}
                onClose={closeTab}
                onOpenTabs={() => {}}
                onViewLive={setViewingTab}
              />
            )}
            {state.workspaces.length === 0 && unsorted.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                No tabs open in Chrome
              </div>
            )}
          </>
        )}

        {state.connected && view === 'all' && (
          <>
            {filteredTabs.map(tab => (
              <TabRow
                key={tab.id}
                tab={tab}
                isActive={tab.id === state.activeTabId}
                onSwitch={switchToTab}
                onClose={closeTab}
                onViewLive={setViewingTab}
              />
            ))}
            {filteredTabs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                {q ? 'No tabs match your filter' : 'No tabs open in Chrome'}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      {state.connected && (
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--ir-glass-border)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.25)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>{state.tabs.length} tab{state.tabs.length !== 1 ? 's' : ''} · {state.workspaces.length} workspace{state.workspaces.length !== 1 ? 's' : ''}</span>
          {state.lastUpdated && <span>Updated {new Date(state.lastUpdated).toLocaleTimeString()}</span>}
        </div>
      )}
    </div>
  );
}

// Shared button style
const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  padding: '4px 6px',
  display: 'flex',
  alignItems: 'center',
  transition: 'all 0.15s'
};

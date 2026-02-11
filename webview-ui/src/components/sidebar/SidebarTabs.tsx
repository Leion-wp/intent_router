import React from 'react';
import { SidebarTabPreset } from '../../types/theme';

type SidebarTabsProps = {
  effectiveTabs: SidebarTabPreset[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
};

export default function SidebarTabs({ effectiveTabs, activeTabId, onSelectTab }: SidebarTabsProps) {
  return (
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
          aria-selected={activeTabId === entry.id}
          aria-controls={`panel-${entry.id}`}
          id={`tab-${entry.id}`}
          onClick={() => onSelectTab(entry.id)}
          className="sidebar-tab"
          title={entry.title}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span className={`codicon ${entry.icon || 'codicon-symbol-misc'}`} style={{ fontSize: '12px' }} />
          <span>{entry.title}</span>
        </button>
      ))}
    </div>
  );
}

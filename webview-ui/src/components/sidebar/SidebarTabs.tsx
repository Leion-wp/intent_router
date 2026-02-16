import React, { useRef } from 'react';
import { SidebarTabPreset } from '../../types/theme';
import { getNextSidebarTabIndex } from '../../utils/sidebarTabNavigationUtils';

type SidebarTabsProps = {
  effectiveTabs: SidebarTabPreset[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
};

function SidebarTabs({ effectiveTabs, activeTabId, onSelectTab }: SidebarTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTabAt = (index: number) => {
    const count = effectiveTabs.length;
    if (count === 0) return;
    const normalizedIndex = ((index % count) + count) % count;
    tabRefs.current[normalizedIndex]?.focus();
  };

  return (
    <div
      className="sidebar-header"
      role="tablist"
      aria-label="Sidebar Sections"
      style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}
    >
      {effectiveTabs.map((entry, index) => (
        <button
          key={entry.id}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          role="tab"
          aria-selected={activeTabId === entry.id}
          aria-controls={`panel-${entry.id}`}
          id={`tab-${entry.id}`}
          tabIndex={activeTabId === entry.id ? 0 : -1}
          onKeyDown={(event) => {
            const nextIndex = getNextSidebarTabIndex(index, event.key, effectiveTabs.length);
            if (nextIndex !== null) {
              event.preventDefault();
              onSelectTab(effectiveTabs[nextIndex].id);
              focusTabAt(nextIndex);
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTab(entry.id);
            }
          }}
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

export default React.memo(SidebarTabs);

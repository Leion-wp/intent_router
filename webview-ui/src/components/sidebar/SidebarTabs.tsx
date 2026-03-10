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
      style={{ 
        display: 'flex', 
        gap: '4px', 
        background: 'rgba(255, 255, 255, 0.03)',
        padding: '4px', 
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}
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
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            flex: 1, 
            justifyContent: 'center',
            padding: '8px 4px',
            borderRadius: '8px',
            border: 'none',
            outline: 'none',
            fontSize: '11px',
            fontWeight: activeTabId === entry.id ? 700 : 500,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <span className={`codicon ${entry.icon || 'codicon-symbol-misc'}`} style={{ fontSize: '14px' }} />
          <span style={{ display: effectiveTabs.length > 3 ? 'none' : 'inline' }}>{entry.title}</span>
        </button>
      ))}
    </div>
  );
}

export default React.memo(SidebarTabs);

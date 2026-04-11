import React, { useEffect, useMemo, useState } from 'react';
import { QuickAddItem } from '../types/quickAdd';
import { getNextQuickAddIndex, resolveQuickAddSubmitIndex } from '../utils/quickAddNavigationUtils';

type QuickAddPaletteProps = {
  quickAddOpen: boolean;
  quickAddAnchor: { x: number; y: number } | null;
  paletteLeft: number;
  paletteTop: number;
  quickAddQuery: string;
  setQuickAddQuery: (value: string) => void;
  filteredQuickAddItems: QuickAddItem[];
  quickAddGroupedItems: Map<string, QuickAddItem[]>;
  categoryTitleMap: Map<string, string>;
  addNodeFromItem: (item: QuickAddItem, pos?: { x: number; y: number }, edge?: any) => void;
  quickAddPos: { x: number; y: number } | null;
  quickAddEdge: any | null;
  setQuickAddOpen: (value: boolean) => void;
  setQuickAddEdge: (value: any | null) => void;
};

function QuickAddPalette(props: QuickAddPaletteProps) {
  const {
    quickAddOpen,
    quickAddAnchor,
    paletteLeft,
    paletteTop,
    quickAddQuery,
    setQuickAddQuery,
    filteredQuickAddItems,
    quickAddGroupedItems,
    categoryTitleMap,
    addNodeFromItem,
    quickAddPos,
    quickAddEdge,
    setQuickAddOpen,
    setQuickAddEdge
  } = props;

  const flatItems = useMemo(() => filteredQuickAddItems.map((entry) => entry.id), [filteredQuickAddItems]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (!quickAddOpen) return;
    setActiveIndex(0);
  }, [quickAddOpen, quickAddQuery]);

  if (!quickAddOpen || !quickAddAnchor) return null;

  return (
    <div
      className="nodrag quick-add-palette"
      role="dialog"
      aria-label="Quick add nodes palette"
      style={{
        position: 'fixed',
        left: paletteLeft,
        top: paletteTop,
        zIndex: 1200,
        width: '280px',
        background: 'var(--ir-glass-bg)',
        backdropFilter: 'var(--ir-glass-blur)',
        border: '1px solid var(--ir-glass-border)',
        boxShadow: 'var(--ir-glass-shadow)',
        borderRadius: '16px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className="nodrag"
        autoFocus
        placeholder="Search nodes…"
        aria-label="Search nodes to add"
        value={quickAddQuery}
        onChange={(event) => setQuickAddQuery(event.target.value)}
        onKeyDown={(event) => {
          const nextIndex = getNextQuickAddIndex(activeIndex, event.key, flatItems.length);
          if (nextIndex !== null) {
            event.preventDefault();
            setActiveIndex(nextIndex);
            return;
          }
          if (event.key === 'Enter' && filteredQuickAddItems.length > 0) {
            const targetIndex = resolveQuickAddSubmitIndex(activeIndex, filteredQuickAddItems.length);
            const targetItem = targetIndex === null ? null : filteredQuickAddItems[targetIndex];
            if (!targetItem) return;
            addNodeFromItem(targetItem, quickAddPos || undefined, quickAddEdge);
            setQuickAddOpen(false);
            setQuickAddEdge(null);
            return;
          }
          if (event.key === 'Escape') {
            setQuickAddOpen(false);
          }
        }}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--ir-node-text)',
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
      <div className="custom-scrollbar" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }} role="listbox" aria-label="Matching nodes">
        {filteredQuickAddItems.length === 0 && (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', padding: '8px', textAlign: 'center' }}>No results</div>
        )}
        {Array.from(quickAddGroupedItems.entries()).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', padding: '4px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {categoryTitleMap.get(category) || category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {items.map((item) => {
                const isActive = filteredQuickAddItems[activeIndex]?.id === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className="quick-add-item nodrag"
                    role="option"
                    aria-selected={isActive}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: isActive ? 'var(--ir-accent-primary)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--ir-node-text)',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 4px 12px rgba(0, 162, 255, 0.3)' : 'none'
                    }}
                    onMouseEnter={() => {
                      const nextIndex = filteredQuickAddItems.findIndex((entry) => entry.id === item.id);
                      if (nextIndex >= 0) {
                        setActiveIndex(nextIndex);
                      }
                    }}
                    onClick={() => {
                      addNodeFromItem(item, quickAddPos || undefined, quickAddEdge);
                      setQuickAddOpen(false);
                      setQuickAddEdge(null);
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(QuickAddPalette);

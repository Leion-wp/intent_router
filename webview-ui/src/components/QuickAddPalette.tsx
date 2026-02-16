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
        width: '260px',
        background: 'var(--vscode-editorWidget-background)',
        border: '1px solid var(--vscode-editorWidget-border)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        borderRadius: '8px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
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
          padding: '6px 8px',
          borderRadius: '6px',
          border: '1px solid var(--vscode-input-border)',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)'
        }}
      />
      <div style={{ maxHeight: '220px', overflow: 'auto' }} role="listbox" aria-label="Matching nodes">
        {filteredQuickAddItems.length === 0 && (
          <div style={{ fontSize: '12px', opacity: 0.7, padding: '6px' }}>No results</div>
        )}
        {Array.from(quickAddGroupedItems.entries()).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '10px', opacity: 0.65, padding: '4px 6px' }}>
              {categoryTitleMap.get(category) || category}
            </div>
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="quick-add-item"
                role="option"
                aria-selected={filteredQuickAddItems[activeIndex]?.id === item.id}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: filteredQuickAddItems[activeIndex]?.id === item.id
                    ? 'var(--vscode-list-activeSelectionBackground)'
                    : 'transparent',
                  color: filteredQuickAddItems[activeIndex]?.id === item.id
                    ? 'var(--vscode-list-activeSelectionForeground)'
                    : 'var(--vscode-foreground)'
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(QuickAddPalette);

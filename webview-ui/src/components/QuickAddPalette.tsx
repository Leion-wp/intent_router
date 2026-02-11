import React from 'react';
import { QuickAddItem } from '../types/quickAdd';

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

export default function QuickAddPalette(props: QuickAddPaletteProps) {
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

  if (!quickAddOpen || !quickAddAnchor) return null;

  return (
    <div
      className="nodrag quick-add-palette"
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
        value={quickAddQuery}
        onChange={(event) => setQuickAddQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && filteredQuickAddItems.length > 0) {
            addNodeFromItem(filteredQuickAddItems[0], quickAddPos || undefined, quickAddEdge);
            setQuickAddOpen(false);
            setQuickAddEdge(null);
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
      <div style={{ maxHeight: '220px', overflow: 'auto' }}>
        {filteredQuickAddItems.length === 0 && (
          <div style={{ fontSize: '12px', opacity: 0.7, padding: '6px' }}>No results</div>
        )}
        {Array.from(quickAddGroupedItems.entries()).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '10px', opacity: 0.65, padding: '4px 6px' }}>
              {categoryTitleMap.get(category) || category}
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="quick-add-item"
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                onClick={() => {
                  addNodeFromItem(item, quickAddPos || undefined, quickAddEdge);
                  setQuickAddOpen(false);
                  setQuickAddEdge(null);
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

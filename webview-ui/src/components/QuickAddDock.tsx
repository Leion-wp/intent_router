import React from 'react';
import { QuickAddItem } from '../types/quickAdd';

type QuickAddDockProps = {
  dockOpen: boolean;
  setDockOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  dockQuery: string;
  setDockQuery: (value: string) => void;
  filteredDockItems: QuickAddItem[];
  dockGroupedItems: Map<string, QuickAddItem[]>;
  categoryTitleMap: Map<string, string>;
  addNodeFromItem: (item: QuickAddItem, pos?: { x: number; y: number }, edge?: any) => void;
  lastCanvasPos: { x: number; y: number } | null;
  chromeOpacity: number;
};

export default function QuickAddDock(props: QuickAddDockProps) {
  const {
    dockOpen,
    setDockOpen,
    dockQuery,
    setDockQuery,
    filteredDockItems,
    dockGroupedItems,
    categoryTitleMap,
    addNodeFromItem,
    lastCanvasPos,
    chromeOpacity
  } = props;

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        top: '50%',
        right: '14px',
        transform: 'translateY(-50%)',
        zIndex: 950,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        opacity: chromeOpacity
      }}
    >
      {dockOpen && (
        <div
          className="nodrag quick-add-dock"
          style={{
            width: '240px',
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
            placeholder="Search nodes…"
            value={dockQuery}
            onChange={(event) => setDockQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && filteredDockItems.length > 0) {
                addNodeFromItem(filteredDockItems[0], lastCanvasPos || undefined, null);
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
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {filteredDockItems.length === 0 && (
              <div style={{ fontSize: '12px', opacity: 0.7, padding: '6px' }}>No results</div>
            )}
            {Array.from(dockGroupedItems.entries()).map(([category, items]) => (
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
                    onClick={() => addNodeFromItem(item, lastCanvasPos || undefined, null)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        className="nodrag"
        onClick={() => setDockOpen((value: boolean) => !value)}
        title="Quick Add"
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '18px',
          border: '1px solid var(--ir-add-border)',
          background: 'var(--ir-add-bg)',
          color: 'var(--ir-add-fg)',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: '30px',
          padding: 0
        }}
      >
        +
      </button>
    </div>
  );
}

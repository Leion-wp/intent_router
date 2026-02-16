import React from 'react';
import { WebviewOutboundMessage } from '../../types/messages';

type CatalogFilter = 'all' | 'context' | 'providers' | 'custom' | 'favorites';

type ProvidersPanelProps = {
  providersSearchRef: React.RefObject<HTMLInputElement | null>;
  providersSearch: string;
  onProvidersSearchChange: (value: string) => void;
  providersFilter: CatalogFilter;
  onProvidersFilterChange: (value: CatalogFilter) => void;
  catalogBySection: {
    favorites: any[];
    context: any[];
    providers: any[];
    custom: any[];
  };
  renderCatalogSection: (
    key: 'favorites' | 'context' | 'providers' | 'custom',
    title: string,
    sectionItems: any[],
    extraAction?: React.ReactNode
  ) => React.ReactNode;
  devMode: boolean;
  onOpenStudio: () => void;
};

function ProvidersPanel({
  providersSearchRef,
  providersSearch,
  onProvidersSearchChange,
  providersFilter,
  onProvidersFilterChange,
  catalogBySection,
  renderCatalogSection,
  devMode,
  onOpenStudio
}: ProvidersPanelProps) {
  return (
    <div className="sidebar-list">
      <input
        ref={providersSearchRef}
        className="nodrag"
        value={providersSearch}
        onChange={(event) => onProvidersSearchChange(event.target.value)}
        placeholder="Search nodes..."
        aria-label="Search available nodes"
        style={{
          width: '100%',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          padding: '6px',
          fontSize: '11px',
          borderRadius: '4px'
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'favorites', label: 'Fav' },
          { key: 'context', label: 'Context' },
          { key: 'providers', label: 'Providers' },
          { key: 'custom', label: 'Custom' }
        ].map((entry) => (
          <button
            type="button"
            key={entry.key}
            className="nodrag"
            onClick={() => onProvidersFilterChange(entry.key as CatalogFilter)}
            aria-pressed={providersFilter === entry.key}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '999px',
              background: providersFilter === entry.key ? 'var(--vscode-button-secondaryBackground)' : 'transparent',
              color: providersFilter === entry.key ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-foreground)',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(providersFilter === 'all' || providersFilter === 'favorites') &&
        catalogBySection.favorites.length > 0 &&
        renderCatalogSection('favorites', 'Favorites', catalogBySection.favorites)}
      {(providersFilter === 'all' || providersFilter === 'context') &&
        renderCatalogSection('context', 'Context', catalogBySection.context)}
      {(providersFilter === 'all' || providersFilter === 'providers') &&
        renderCatalogSection('providers', 'Providers', catalogBySection.providers)}
      {(providersFilter === 'all' || providersFilter === 'custom') &&
        renderCatalogSection(
          'custom',
          'Custom Nodes',
          catalogBySection.custom,
          <button
            type="button"
            className="nodrag"
            onClick={onOpenStudio}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--vscode-textLink-foreground)',
              cursor: 'pointer',
              fontSize: '11px'
            }}
            title="Open Node Studio"
          >
            Open Studio
          </button>
        )}

      {devMode && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--vscode-panel-border)' }}>
          <div style={{ fontSize: '11px', opacity: 0.85, padding: '0 8px 6px 8px' }}>Dev</div>
          <button
            type="button"
            className="nodrag"
            onClick={() => {
              if (!window.vscode) return;
              const msg: WebviewOutboundMessage = { type: 'devPackager.loadPreset' };
              window.vscode.postMessage(msg);
            }}
            style={{
              width: '100%',
              padding: '6px',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px'
            }}
            title="Load the Dev Packager preset pipeline into the builder"
          >
            Load Dev Packager
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(ProvidersPanel);

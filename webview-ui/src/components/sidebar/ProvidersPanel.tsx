import React from 'react';
import { WebviewOutboundMessage } from '../../types/messages';

type ProvidersPanelProps = {
  providersSearchRef: React.RefObject<HTMLInputElement | null>;
  providersSearch: string;
  onProvidersSearchChange: (value: string) => void;
  catalogBySection: {
    flow: any[];
    ai: any[];
    review: any[];
    providers: any[];
    custom: any[];
  };
  renderCatalogSection: (
    key: 'flow' | 'ai' | 'review' | 'providers' | 'custom',
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
  catalogBySection,
  renderCatalogSection,
  devMode,
  onOpenStudio
}: ProvidersPanelProps) {
  return (
    <div className="sidebar-list" style={{ gap: '16px' }}>
      <div style={{ position: 'relative' }}>
        <span className="codicon codicon-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.4, pointerEvents: 'none' }}></span>
        <input
          ref={providersSearchRef}
          className="nodrag"
          value={providersSearch}
          onChange={(event) => onProvidersSearchChange(event.target.value)}
          placeholder="Search modules..."
          aria-label="Search available nodes"
          style={{
            width: '100%',
            background: 'rgba(255, 255, 255, 0.03)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '10px 12px 10px 36px',
            fontSize: '12px',
            borderRadius: '999px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>
      {renderCatalogSection('flow', 'Flow', catalogBySection.flow)}
      {renderCatalogSection('ai', 'AI', catalogBySection.ai)}
      {renderCatalogSection('review', 'Review & I/O', catalogBySection.review)}
      {renderCatalogSection('providers', 'Providers', catalogBySection.providers)}
      {renderCatalogSection(
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

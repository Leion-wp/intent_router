import React from 'react';
import { SidebarTabPreset, SidebarTabType, UiPreset } from '../../types/theme';

type UiDraftDiff = {
  themeChanged: boolean;
  tabsChanged: boolean;
  categoriesChanged: boolean;
  pinnedChanged: boolean;
  hasChanges: boolean;
};

type StudioAdminPanelProps = {
  uiPresetDraft: UiPreset;
  setThemeToken: (path: string, value: string) => void;
  updateSidebarTabField: (id: string, patch: Partial<SidebarTabPreset>) => void;
  moveSidebarTab: (id: string, direction: -1 | 1) => void;
  removeSidebarTab: (id: string) => void;
  addSidebarTab: () => void;
  updatePaletteCategory: (id: string, patch: Record<string, unknown>) => void;
  movePaletteCategory: (id: string, direction: -1 | 1) => void;
  updatePinnedList: (raw: string) => void;
  uiDraftDiff: UiDraftDiff;
  uiDraftValidationErrors: string[];
  saveThemeDraft: () => void;
  resetThemeDraft: () => void;
  exportTheme: () => void;
  resetThemeDefaults: () => void;
  propagateThemeDraft: () => void;
  canPropagate: boolean;
  importTheme: (source: 'paste' | 'file') => void;
  themeImportJson: string;
  setThemeImportJson: (value: string) => void;
  themeExportJson: string;
  themeError: string;
  uiPropagateSummary: string;
  retryLastAction: () => void;
  clearFeedback: () => void;
  canRetryLastAction: boolean;
};

const tokenSections: Array<{ title: string; fields: Array<[string, string]> }> = [
  {
    title: 'Run + Add',
    fields: [
      ['runButton.idle', 'Run idle'],
      ['runButton.running', 'Run running'],
      ['runButton.success', 'Run success'],
      ['runButton.error', 'Run error'],
      ['runButton.foreground', 'Run fg'],
      ['addButton.background', 'Add bg'],
      ['addButton.foreground', 'Add fg'],
      ['addButton.border', 'Add border']
    ]
  },
  {
    title: 'Node + Status',
    fields: [
      ['node.background', 'Node bg'],
      ['node.border', 'Node border'],
      ['node.text', 'Node text'],
      ['status.running', 'Status running'],
      ['status.success', 'Status success'],
      ['status.error', 'Status error']
    ]
  },
  {
    title: 'Edges + Minimap + Controls',
    fields: [
      ['edges.idle', 'Edge idle'],
      ['edges.running', 'Edge running'],
      ['edges.success', 'Edge success'],
      ['edges.error', 'Edge error'],
      ['minimap.background', 'MiniMap bg'],
      ['minimap.node', 'MiniMap node'],
      ['minimap.mask', 'MiniMap mask'],
      ['minimap.viewportBorder', 'MiniMap border'],
      ['controls.background', 'Controls bg'],
      ['controls.buttonBackground', 'Controls btn bg'],
      ['controls.buttonForeground', 'Controls btn fg'],
      ['controls.buttonHoverBackground', 'Controls hover bg'],
      ['controls.buttonHoverForeground', 'Controls hover fg']
    ]
  }
];

export default function StudioAdminPanel({
  uiPresetDraft,
  setThemeToken,
  updateSidebarTabField,
  moveSidebarTab,
  removeSidebarTab,
  addSidebarTab,
  updatePaletteCategory,
  movePaletteCategory,
  updatePinnedList,
  uiDraftDiff,
  uiDraftValidationErrors,
  saveThemeDraft,
  resetThemeDraft,
  exportTheme,
  resetThemeDefaults,
  propagateThemeDraft,
  canPropagate,
  importTheme,
  themeImportJson,
  setThemeImportJson,
  themeExportJson,
  themeError,
  uiPropagateSummary,
  retryLastAction,
  clearFeedback,
  canRetryLastAction
}: StudioAdminPanelProps) {
  return (
    <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Theme Studio (Admin)</div>

      {tokenSections.map((section) => (
        <div key={section.title} style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>{section.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: '6px', alignItems: 'center' }}>
            {section.fields.map(([path, label]) => {
              const [group, key] = path.split('.');
              const value = String(((uiPresetDraft.theme.tokens as any)[group] || {})[key] || '#000000');
              return (
                <React.Fragment key={path}>
                  <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}</label>
                  <input
                    className="nodrag"
                    type="color"
                    value={value}
                    onChange={(event) => setThemeToken(path, event.target.value)}
                    aria-label={`${label} color token`}
                    style={{ width: '100%', height: '24px', border: '1px solid var(--vscode-panel-border)', background: 'transparent' }}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>UI Studio v1 — Sidebar Tabs</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(uiPresetDraft.sidebar.tabs || []).map((entry, index) => (
            <div key={entry.id} style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', padding: '6px', display: 'grid', gridTemplateColumns: '1fr 92px 92px', gap: '6px' }}>
              <input
                className="nodrag"
                value={entry.title}
                onChange={(event) => updateSidebarTabField(entry.id, { title: event.target.value })}
                placeholder="Title"
                aria-label={`Sidebar tab title for ${entry.id}`}
                style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
              />
              <select
                className="nodrag"
                value={entry.type}
                onChange={(event) => updateSidebarTabField(entry.id, { type: event.target.value as SidebarTabType })}
                aria-label={`Sidebar tab type for ${entry.id}`}
                style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
              >
                <option value="pipelines">pipelines</option>
                <option value="history">history</option>
                <option value="settings">settings</option>
                <option value="catalog">catalog</option>
                <option value="importExport">importExport</option>
                <option value="studio">studio</option>
              </select>
              <input
                className="nodrag"
                value={entry.icon}
                onChange={(event) => updateSidebarTabField(entry.id, { icon: event.target.value })}
                placeholder="codicon-*"
                aria-label={`Sidebar tab icon for ${entry.id}`}
                style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
              />
              <input
                className="nodrag"
                value={entry.id}
                onChange={(event) => updateSidebarTabField(entry.id, { id: event.target.value })}
                placeholder="id"
                aria-label={`Sidebar tab id field ${index + 1}`}
                style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', opacity: 0.9 }}>
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={entry.visible !== false}
                  onChange={(event) => updateSidebarTabField(entry.id, { visible: event.target.checked })}
                />
                visible
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                <button className="nodrag" onClick={() => moveSidebarTab(entry.id, -1)} disabled={index === 0} aria-label={`Move tab ${entry.id} up`} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↑</button>
                <button className="nodrag" onClick={() => moveSidebarTab(entry.id, 1)} disabled={index === (uiPresetDraft.sidebar.tabs.length - 1)} aria-label={`Move tab ${entry.id} down`} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === (uiPresetDraft.sidebar.tabs.length - 1) ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↓</button>
                <button className="nodrag" onClick={() => removeSidebarTab(entry.id)} disabled={uiPresetDraft.sidebar.tabs.length <= 1} aria-label={`Remove tab ${entry.id}`} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-errorForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: uiPresetDraft.sidebar.tabs.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>✕</button>
              </div>
            </div>
          ))}
          <button className="nodrag" onClick={addSidebarTab} style={{ marginTop: '2px', padding: '5px 8px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
            + Add Tab
          </button>
        </div>
      </div>

      <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>UI Studio v1 — Palette</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {([...uiPresetDraft.palette.categories] || []).sort((a, b) => Number(a.order) - Number(b.order)).map((entry, index, list) => (
            <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: '6px', alignItems: 'center', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', padding: '6px' }}>
              <input
                className="nodrag"
                value={entry.title}
                onChange={(event) => updatePaletteCategory(entry.id, { title: event.target.value })}
                aria-label={`Palette category title for ${entry.id}`}
                style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '4px', fontSize: '11px' }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={entry.visible !== false}
                  onChange={(event) => updatePaletteCategory(entry.id, { visible: event.target.checked })}
                />
                visible
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                <button className="nodrag" onClick={() => movePaletteCategory(entry.id, -1)} disabled={index === 0} aria-label={`Move category ${entry.id} up`} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↑</button>
                <button className="nodrag" onClick={() => movePaletteCategory(entry.id, 1)} disabled={index === (list.length - 1)} aria-label={`Move category ${entry.id} down`} style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: index === (list.length - 1) ? 'not-allowed' : 'pointer', fontSize: '10px' }}>↓</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '8px', marginBottom: '4px' }}>Pinned Quick Add IDs (comma-separated)</div>
        <input
          className="nodrag"
          value={(uiPresetDraft.palette.pinned || []).join(', ')}
          onChange={(event) => updatePinnedList(event.target.value)}
          placeholder="preset-terminal, preset-form"
          aria-label="Pinned quick add ids"
          style={{ width: '100%', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', padding: '6px', fontSize: '11px' }}
        />
      </div>

      <div style={{ marginTop: '10px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>Draft → Release Diff</div>
        <div style={{ fontSize: '11px', opacity: 0.9, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px' }}>
          <span>Theme tokens</span>
          <span style={{ color: uiDraftDiff.themeChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.themeChanged ? 'changed' : 'unchanged'}</span>
          <span>Sidebar tabs</span>
          <span style={{ color: uiDraftDiff.tabsChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.tabsChanged ? 'changed' : 'unchanged'}</span>
          <span>Palette categories</span>
          <span style={{ color: uiDraftDiff.categoriesChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.categoriesChanged ? 'changed' : 'unchanged'}</span>
          <span>Pinned IDs</span>
          <span style={{ color: uiDraftDiff.pinnedChanged ? 'var(--ir-status-success)' : 'var(--vscode-descriptionForeground)' }}>{uiDraftDiff.pinnedChanged ? 'changed' : 'unchanged'}</span>
        </div>
        {uiDraftValidationErrors.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--vscode-errorForeground)' }}>
            {uiDraftValidationErrors.map((error, index) => (
              <div key={`${error}-${index}`}>• {error}</div>
            ))}
          </div>
        )}
        {!uiDraftDiff.hasChanges && (
          <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.75 }}>No changes detected between Draft and Release.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <button className="nodrag" onClick={saveThemeDraft} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Save Draft
        </button>
        <button className="nodrag" onClick={resetThemeDraft} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Reset
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button className="nodrag" onClick={exportTheme} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Export
        </button>
        <button className="nodrag" onClick={resetThemeDefaults} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Defaults
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          className="nodrag"
          onClick={propagateThemeDraft}
          disabled={!canPropagate}
          style={{
            flex: 1,
            padding: '6px',
            background: canPropagate ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-input-background)',
            color: canPropagate ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
            border: 'none',
            cursor: canPropagate ? 'pointer' : 'not-allowed',
            fontSize: '11px'
          }}
          title={canPropagate ? 'Propagate draft to release preset' : 'Fix validation errors or make changes before propagating'}
        >
          Propagate
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button className="nodrag" onClick={() => importTheme('paste')} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Import Paste
        </button>
        <button className="nodrag" onClick={() => importTheme('file')} style={{ flex: 1, padding: '6px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', cursor: 'pointer', fontSize: '11px' }}>
          Import File
        </button>
      </div>
      <textarea
        className="nodrag"
        value={themeImportJson}
        onChange={(event) => setThemeImportJson(event.target.value)}
        placeholder='{"version":1,"theme":{"tokens":{...}},"sidebar":{"tabs":[...]},"palette":{"categories":[...],"pinned":[...]}}'
        aria-label="Theme draft import JSON"
        style={{
          marginTop: '8px',
          width: '100%',
          minHeight: '70px',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          padding: '6px',
          fontSize: '11px',
          fontFamily: 'var(--vscode-editor-font-family, monospace)'
        }}
      />
      {themeExportJson && (
        <textarea
          className="nodrag"
          readOnly
          value={themeExportJson}
          aria-label="Theme export JSON"
          style={{
            marginTop: '8px',
            width: '100%',
            minHeight: '70px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            padding: '6px',
            fontSize: '11px',
            fontFamily: 'var(--vscode-editor-font-family, monospace)'
          }}
        />
      )}
      {themeError && (
        <div style={{ marginTop: '8px', color: 'var(--vscode-errorForeground)', fontSize: '11px' }}>
          {themeError}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              className="nodrag"
              onClick={retryLastAction}
              disabled={!canRetryLastAction}
              style={{
                padding: '4px 8px',
                background: canRetryLastAction ? 'var(--vscode-button-secondaryBackground)' : 'transparent',
                color: canRetryLastAction ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-descriptionForeground)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '4px',
                cursor: canRetryLastAction ? 'pointer' : 'not-allowed',
                fontSize: '11px'
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="nodrag"
              onClick={clearFeedback}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {uiPropagateSummary && (
        <div style={{ marginTop: '8px', color: 'var(--vscode-textLink-foreground)', fontSize: '11px' }}>
          {uiPropagateSummary}
        </div>
      )}
    </div>
  );
}

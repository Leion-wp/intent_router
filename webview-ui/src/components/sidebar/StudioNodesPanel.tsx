import React from 'react';
import SchemaArgsForm, { SchemaField } from '../SchemaArgsForm';

type StudioDraft = {
  id?: string;
  title?: string;
  intent?: string;
  schema?: SchemaField[];
  mapping?: Record<string, unknown>;
};

type StudioNodesPanelProps = {
  customNodes: any[];
  studioSelectedId: string;
  studioDraft: StudioDraft | null;
  setStudioDraft: (next: StudioDraft | null) => void;
  studioMappingJson: string;
  setStudioMappingJson: (value: string) => void;
  studioPreviewValues: Record<string, any>;
  setStudioPreviewValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  studioError: string;
  studioExportJson: string;
  studioImportJson: string;
  setStudioImportJson: (value: string) => void;
  studioImportSummary: string;
  allCapabilities: string[];
  startNewDraft: () => void;
  saveDraft: () => void;
  exportSelectedOrAll: (scope: 'one' | 'all') => void;
  importFromFile: () => void;
  importFromPaste: () => void;
  selectDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  onDragStartCustomNode: (event: React.DragEvent, customNodeId: string) => void;
};

export default function StudioNodesPanel({
  customNodes,
  studioSelectedId,
  studioDraft,
  setStudioDraft,
  studioMappingJson,
  setStudioMappingJson,
  studioPreviewValues,
  setStudioPreviewValues,
  studioError,
  studioExportJson,
  studioImportJson,
  setStudioImportJson,
  studioImportSummary,
  allCapabilities,
  startNewDraft,
  saveDraft,
  exportSelectedOrAll,
  importFromFile,
  importFromPaste,
  selectDraft,
  deleteDraft,
  onDragStartCustomNode
}: StudioNodesPanelProps) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <button
          className="nodrag"
          onClick={startNewDraft}
          style={{
            flex: 1,
            padding: '6px',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          + New
        </button>
        <button
          className="nodrag"
          onClick={saveDraft}
          disabled={!studioDraft}
          style={{
            flex: 1,
            padding: '6px',
            background: studioDraft ? 'var(--vscode-button-background)' : 'transparent',
            color: studioDraft ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
            border: studioDraft ? 'none' : '1px solid var(--vscode-panel-border)',
            cursor: studioDraft ? 'pointer' : 'not-allowed',
            fontSize: '11px',
            opacity: studioDraft ? 1 : 0.6
          }}
        >
          Save
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button
          className="nodrag"
          onClick={() => exportSelectedOrAll(studioSelectedId ? 'one' : 'all')}
          style={{
            flex: 1,
            padding: '6px',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          title="Export JSON (copies to clipboard)"
        >
          Export
        </button>
        <button
          className="nodrag"
          onClick={importFromFile}
          style={{
            flex: 1,
            padding: '6px',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          title="Import JSON from file"
        >
          Import File
        </button>
      </div>

      {studioError && (
        <div style={{ color: 'var(--vscode-errorForeground)', fontSize: '11px', marginBottom: '8px' }}>
          {studioError}
        </div>
      )}
      {studioImportSummary && (
        <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>
          {studioImportSummary}
        </div>
      )}

      <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '6px' }}>Existing</div>
      <div className="sidebar-list" style={{ marginBottom: '12px' }}>
        {customNodes.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: '12px', padding: '6px 0' }}>No custom nodes yet.</div>
        )}
        {customNodes.map((node: any) => {
          const nodeId = String(node?.id || '');
          const selected = studioSelectedId === nodeId;
          return (
            <div
              key={nodeId}
              onClick={() => selectDraft(nodeId)}
              draggable
              onDragStart={(event) => onDragStartCustomNode(event, nodeId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                border: selected ? '1px solid var(--vscode-focusBorder)' : '1px solid transparent',
                background: selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <span className="codicon codicon-symbol-structure"></span>
                <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {String(node?.title || nodeId)}
                </span>
              </div>
              <button
                className="nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteDraft(nodeId);
                }}
                title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
              >
                <span className="codicon codicon-trash"></span>
              </button>
            </div>
          );
        })}
      </div>

      {studioDraft && (
        <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
          <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Editor</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              className="nodrag"
              placeholder="id (unique)"
              value={String(studioDraft.id || '')}
              onChange={(event) => setStudioDraft({ ...studioDraft, id: event.target.value })}
              style={{
                width: '100%',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '6px',
                fontSize: '11px'
              }}
            />
            <input
              className="nodrag"
              placeholder="title"
              value={String(studioDraft.title || '')}
              onChange={(event) => setStudioDraft({ ...studioDraft, title: event.target.value })}
              style={{
                width: '100%',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                padding: '6px',
                fontSize: '11px'
              }}
            />

            <div>
              <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Intent</div>
              <input
                className="nodrag"
                list="studio-intents"
                placeholder="intent (e.g. git.checkout)"
                value={String(studioDraft.intent || '')}
                onChange={(event) => setStudioDraft({ ...studioDraft, intent: event.target.value })}
                style={{
                  width: '100%',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border)',
                  padding: '6px',
                  fontSize: '11px'
                }}
              />
              <datalist id="studio-intents">
                {allCapabilities.map((capability) => (
                  <option key={capability} value={capability} />
                ))}
              </datalist>
            </div>

            <div style={{ border: '1px solid var(--vscode-widget-border)', borderRadius: '4px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', opacity: 0.85 }}>Schema</div>
                <button
                  className="nodrag"
                  onClick={() => setStudioDraft({ ...studioDraft, schema: [...(studioDraft.schema || []), { name: '', type: 'string' }] })}
                  style={{
                    background: 'none',
                    border: '1px solid var(--vscode-panel-border)',
                    color: 'var(--vscode-foreground)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                >
                  + Field
                </button>
              </div>

              {(studioDraft.schema || []).map((field, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 1fr 24px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input
                    className="nodrag"
                    placeholder="name"
                    value={String(field?.name || '')}
                    onChange={(event) => {
                      const next = [...(studioDraft.schema || [])];
                      next[index] = { ...next[index], name: event.target.value };
                      setStudioDraft({ ...studioDraft, schema: next });
                    }}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <select
                    className="nodrag"
                    value={String(field?.type || 'string')}
                    onChange={(event) => {
                      const next = [...(studioDraft.schema || [])];
                      next[index] = { ...next[index], type: event.target.value as SchemaField['type'] };
                      setStudioDraft({ ...studioDraft, schema: next });
                    }}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  >
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="enum">enum</option>
                    <option value="path">path</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                    <input
                      className="nodrag"
                      type="checkbox"
                      checked={!!field?.required}
                      onChange={(event) => {
                        const next = [...(studioDraft.schema || [])];
                        next[index] = { ...next[index], required: event.target.checked };
                        setStudioDraft({ ...studioDraft, schema: next });
                      }}
                    />
                    req
                  </label>
                  <input
                    className="nodrag"
                    placeholder="default / options (enum: a,b,c)"
                    value={
                      field?.type === 'enum'
                        ? (Array.isArray(field?.options) ? field.options.join(',') : String(field?.options || ''))
                        : (field?.default !== undefined ? String(field.default) : '')
                    }
                    onChange={(event) => {
                      const next = [...(studioDraft.schema || [])];
                      if (String(next[index]?.type) === 'enum') {
                        const raw = event.target.value;
                        next[index] = { ...next[index], options: raw.split(',').map(value => value.trim()).filter(Boolean) };
                      } else {
                        next[index] = { ...next[index], default: event.target.value };
                      }
                      setStudioDraft({ ...studioDraft, schema: next });
                    }}
                    style={{
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <button
                    className="nodrag"
                    onClick={() => {
                      const next = [...(studioDraft.schema || [])];
                      next.splice(index, 1);
                      setStudioDraft({ ...studioDraft, schema: next });
                    }}
                    title="Remove"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-errorForeground)' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ fontSize: '10px', opacity: 0.65 }}>Mapping defaults to identity if left empty.</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>Mapping (JSON)</div>
              <textarea
                className="nodrag"
                value={studioMappingJson}
                onChange={(event) => setStudioMappingJson(event.target.value)}
                placeholder='{ "payloadKey": "fieldName" }'
                style={{
                  width: '100%',
                  minHeight: '90px',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border)',
                  padding: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--vscode-editor-font-family, monospace)'
                }}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Import (paste JSON)</div>
              <textarea
                className="nodrag"
                value={studioImportJson}
                onChange={(event) => setStudioImportJson(event.target.value)}
                placeholder='{"version":1,"nodes":[...]}'
                style={{
                  width: '100%',
                  minHeight: '90px',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border)',
                  padding: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--vscode-editor-font-family, monospace)'
                }}
              />
              <button
                className="nodrag"
                onClick={importFromPaste}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '6px',
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                Import Paste
              </button>
            </div>

            {studioExportJson && (
              <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Last Export</div>
                <textarea
                  className="nodrag"
                  readOnly
                  value={studioExportJson}
                  style={{
                    width: '100%',
                    minHeight: '90px',
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    padding: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--vscode-editor-font-family, monospace)'
                  }}
                />
                <div style={{ fontSize: '10px', opacity: 0.65 }}>Copied to clipboard on export.</div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '8px' }}>Preview</div>
              <SchemaArgsForm
                nodeId="studio-preview"
                fields={[...(studioDraft.schema || []), { name: 'description', type: 'string', description: 'Step description for logs' }]}
                values={studioPreviewValues}
                onChange={(name, value) => setStudioPreviewValues((prev) => ({ ...prev, [name]: value }))}
                availableVars={[]}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

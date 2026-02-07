import React, { useEffect, useMemo, useState } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';

export type SchemaField = {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'path';
  description?: string;
  options?: string[] | string;
  required?: boolean;
  default?: any;
};

type Props = {
  nodeId: string;
  fields: SchemaField[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  availableVars: string[];
};

// Shared schema-driven form renderer (used by provider nodes + custom nodes)
export default function SchemaArgsForm({ nodeId, fields, values, onChange, availableVars }: Props) {
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [varPickerOpen, setVarPickerOpen] = useState<Record<string, boolean>>({});

  const stableFields = useMemo(() => fields || [], [fields]);

  // Initialize defaults, validate required, and fetch dynamic options.
  useEffect(() => {
    const newErrors: Record<string, boolean> = {};
    for (const field of stableFields) {
      const current = values[field.name];
      if (current === undefined && field.default !== undefined) {
        onChange(field.name, field.default);
      }
      if (field.required && (values[field.name] === undefined || values[field.name] === '')) {
        newErrors[field.name] = true;
      }
      if (field.type === 'enum' && typeof field.options === 'string' && !dynamicOptions[field.name]) {
        if (window.vscode) {
          const msg: WebviewOutboundMessage = {
            type: 'fetchOptions',
            command: field.options,
            argName: field.name
          };
          window.vscode.postMessage(msg);
        }
      }
    }
    setErrors(newErrors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableFields, values]);

  // Listen for dynamic option responses.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!isInboundMessage(message)) {
        return;
      }
      if (message.type === 'optionsFetched') {
        setDynamicOptions((prev) => ({
          ...prev,
          [message.argName]: message.options
        }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleHelp = (key: string) => setExpandedHelp((prev) => ({ ...prev, [key]: !prev[key] }));

  const insertVariable = (key: string, varName?: string) => {
    const current = values[key] || '';
    const name = (varName || '').trim();
    if (!name) return;
    onChange(key, current + `\${var:${name}}`);
  };

  const openVarPicker = (argName: string) => setVarPickerOpen((prev) => ({ ...prev, [argName]: true }));
  const closeVarPicker = (argName: string) => setVarPickerOpen((prev) => ({ ...prev, [argName]: false }));

  const handleBrowse = (key: string) => {
    if (!window.vscode) {
      const mockPath = '/mock/path/to/folder';
      onChange(key, mockPath);
      return;
    }

    const msg: WebviewOutboundMessage = { type: 'selectPath', id: nodeId, argName: key };
    window.vscode.postMessage(msg);

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!isInboundMessage(message)) return;
      if (message.type === 'pathSelected' && message.id === nodeId && message.argName === key) {
        onChange(key, message.path);
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {stableFields.map((field) => {
        const inputId = `input-${nodeId}-${field.name}`;
        const showHelp = expandedHelp[field.name];
        const hasError = errors[field.name];
        const inputBorderColor = hasError ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border)';

        const showVarInsert = field.type === 'string' || field.type === 'path';

        return (
          <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label
                htmlFor={inputId}
                style={{
                  fontSize: '0.75em',
                  opacity: 0.9,
                  display: 'flex',
                  alignItems: 'center',
                  color: hasError ? 'var(--vscode-inputValidation-errorForeground)' : 'inherit'
                }}
              >
                {field.name}
                {field.required && <span style={{ color: 'var(--ir-status-error)', marginLeft: '2px' }}>*</span>}
              </label>
              {field.description && (
                <button
                  onClick={() => toggleHelp(field.name)}
                  title="Toggle description"
                  className="nodrag"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: showHelp ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-descriptionForeground)',
                    cursor: 'pointer',
                    fontSize: '0.9em',
                    padding: '0 4px'
                  }}
                >
                  ⓘ
                </button>
              )}
            </div>

            {showHelp && field.description && (
              <div
                style={{
                  fontSize: '0.7em',
                  color: 'var(--vscode-descriptionForeground)',
                  marginBottom: '2px',
                  fontStyle: 'italic',
                  padding: '2px 4px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '2px'
                }}
              >
                {field.description}
              </div>
            )}

            {field.type === 'boolean' ? (
              <input
                id={inputId}
                type="checkbox"
                className="nodrag"
                checked={!!values[field.name]}
                onChange={(e) => onChange(field.name, e.target.checked)}
                style={{
                  alignSelf: 'flex-start',
                  outline: hasError ? `1px solid ${inputBorderColor}` : 'none'
                }}
              />
            ) : field.type === 'enum' ? (
              <select
                id={inputId}
                className="nodrag"
                value={values[field.name] || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: `1px solid ${inputBorderColor}`,
                  padding: '4px'
                }}
              >
                <option value="">(Select)</option>
                {(Array.isArray(field.options) ? field.options : dynamicOptions[field.name] || []).map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === 'path' ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  id={inputId}
                  className="nodrag"
                  type="text"
                  value={values[field.name] || ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.default !== undefined ? `${field.default} (default)` : ''}
                  style={{
                    flex: 1,
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: `1px solid ${inputBorderColor}`,
                    padding: '4px',
                    fontSize: '0.9em'
                  }}
                />
                <button
                  className="nodrag"
                  onClick={() => handleBrowse(field.name)}
                  title="Browse..."
                  style={{
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <span className="codicon codicon-folder-opened"></span>
                </button>
                {showVarInsert && (
                  <>
                    <button
                      className="nodrag"
                      onClick={() => openVarPicker(field.name)}
                      title="Insert variable (${var:...})"
                      aria-label={`Insert variable for ${field.name}`}
                      style={{
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        width: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {'{ }'}
                    </button>
                    {varPickerOpen[field.name] && (
                      <select
                        className="nodrag"
                        autoFocus
                        value=""
                        onBlur={() => closeVarPicker(field.name)}
                        onChange={(e) => {
                          const selected = e.target.value;
                          if (selected) insertVariable(field.name, selected);
                          closeVarPicker(field.name);
                        }}
                        style={{
                          maxWidth: '160px',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '4px',
                          fontSize: '0.9em'
                        }}
                      >
                        <option value="">Select var…</option>
                        {availableVars.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  id={inputId}
                  className="nodrag"
                  type="text"
                  value={values[field.name] || ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.default !== undefined ? `${field.default} (default)` : ''}
                  style={{
                    flex: 1,
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: `1px solid ${inputBorderColor}`,
                    padding: '4px',
                    fontSize: '0.9em'
                  }}
                />
                {showVarInsert && (
                  <>
                    <button
                      className="nodrag"
                      onClick={() => openVarPicker(field.name)}
                      title="Insert variable (${var:...})"
                      aria-label={`Insert variable for ${field.name}`}
                      style={{
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        width: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {'{ }'}
                    </button>
                    {varPickerOpen[field.name] && (
                      <select
                        className="nodrag"
                        autoFocus
                        value=""
                        onBlur={() => closeVarPicker(field.name)}
                        onChange={(e) => {
                          const selected = e.target.value;
                          if (selected) insertVariable(field.name, selected);
                          closeVarPicker(field.name);
                        }}
                        style={{
                          maxWidth: '160px',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '4px',
                          fontSize: '0.9em'
                        }}
                      >
                        <option value="">Select var…</option>
                        {availableVars.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


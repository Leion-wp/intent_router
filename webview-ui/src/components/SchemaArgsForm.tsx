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
          <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label
                htmlFor={inputId}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  opacity: field.required ? 0.95 : 0.4,
                  display: 'flex',
                  alignItems: 'center',
                  color: hasError ? 'var(--ir-accent-error)' : '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px'
                }}
              >
                {field.name}
                {field.required && <span style={{ color: 'var(--ir-accent-error)', marginLeft: '4px' }}>*</span>}
                {!field.required && <span style={{ marginLeft: '6px', fontSize: '10px', textTransform: 'lowercase', fontWeight: 400 }}>(opt)</span>}
              </label>
              {field.description && (
                <button
                  onClick={() => toggleHelp(field.name)}
                  title="Toggle description"
                  className="nodrag"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: showHelp ? 'var(--ir-accent-primary)' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span className={`codicon codicon-${showHelp ? 'info' : 'question'}`}></span>
                </button>
              )}
            </div>

            {showHelp && field.description && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '4px',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px',
                  borderLeft: '2px solid var(--ir-accent-primary)',
                  lineHeight: '1.4'
                }}
              >
                {field.description}
              </div>
            )}

            {field.type === 'boolean' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  id={inputId}
                  type="checkbox"
                  className="nodrag"
                  checked={!!values[field.name]}
                  onChange={(e) => onChange(field.name, e.target.checked)}
                />
                <span style={{ fontSize: '12px', opacity: 0.7 }}>Enabled</span>
              </div>
            ) : field.type === 'enum' ? (
              <select
                id={inputId}
                className="nodrag"
                value={values[field.name] || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                style={{
                  width: '100%',
                  borderColor: hasError ? 'var(--ir-accent-error)' : 'rgba(255,255,255,0.1)'
                }}
              >
                <option value="" style={{ background: '#1a1a20' }}>(Select)</option>
                {(Array.isArray(field.options) ? field.options : dynamicOptions[field.name] || []).map((opt: string) => (
                  <option key={opt} value={opt} style={{ background: '#1a1a20' }}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === 'path' ? (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id={inputId}
                  className="nodrag"
                  type="text"
                  value={values[field.name] || ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.default !== undefined ? `${field.default}` : 'Enter path...'}
                  style={{
                    flex: 1,
                    borderColor: hasError ? 'var(--ir-accent-error)' : 'rgba(255,255,255,0.1)'
                  }}
                />
                <button
                  className="nodrag"
                  onClick={() => handleBrowse(field.name)}
                  title="Browse..."
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    width: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <span className="codicon codicon-folder-opened" style={{ fontSize: '14px' }}></span>
                </button>
                {showVarInsert && (
                  <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                    <button
                      className="nodrag"
                      onClick={() => openVarPicker(field.name)}
                      title="Insert variable"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--ir-accent-primary)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        width: '32px',
                        fontWeight: 700,
                        fontSize: '12px',
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
                          position: 'absolute',
                          right: 0,
                          top: '36px',
                          zIndex: 100,
                          minWidth: '160px',
                          background: 'rgba(25, 25, 30, 0.95)',
                          backdropFilter: 'blur(10px)',
                          boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
                        }}
                      >
                        <option value="" style={{ background: '#1a1a20' }}>Select var…</option>
                        {availableVars.map((v) => (
                          <option key={v} value={v} style={{ background: '#1a1a20' }}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id={inputId}
                  className="nodrag"
                  type="text"
                  value={values[field.name] || ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.default !== undefined ? `${field.default}` : `Enter ${field.name}...`}
                  style={{
                    flex: 1,
                    borderColor: hasError ? 'var(--ir-accent-error)' : 'rgba(255,255,255,0.1)'
                  }}
                />
                {showVarInsert && (
                  <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                    <button
                      className="nodrag"
                      onClick={() => openVarPicker(field.name)}
                      title="Insert variable"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--ir-accent-primary)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        width: '32px',
                        fontWeight: 700,
                        fontSize: '12px',
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
                          position: 'absolute',
                          right: 0,
                          top: '36px',
                          zIndex: 100,
                          minWidth: '160px',
                          background: 'rgba(25, 25, 30, 0.95)',
                          backdropFilter: 'blur(10px)',
                          boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
                        }}
                      >
                        <option value="" style={{ background: '#1a1a20' }}>Select var…</option>
                        {availableVars.map((v) => (
                          <option key={v} value={v} style={{ background: '#1a1a20' }}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


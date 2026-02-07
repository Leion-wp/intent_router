import React from 'react';

type Props = {
  inputs: string[];
  outputs: string[];
};

const renderList = (items: string[]) => {
  if (!items.length) {
    return <span style={{ fontSize: '10px', opacity: 0.55 }}>none</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            border: '1px solid var(--vscode-editorWidget-border)',
            opacity: 0.9,
            whiteSpace: 'nowrap'
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
};

export default function IoSpec({ inputs, outputs }: Props) {
  return (
    <div
      style={{
        marginBottom: '8px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        border: '1px solid var(--vscode-editorWidget-border)',
        borderRadius: '6px',
        padding: '6px'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '10px', opacity: 0.65, marginBottom: '4px' }}>Inputs</div>
        {renderList(inputs)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '10px', opacity: 0.65, marginBottom: '4px' }}>Outputs</div>
        {renderList(outputs)}
      </div>
    </div>
  );
}

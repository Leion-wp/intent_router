import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';

const InsertableEdge = (props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      
      {/* Cyber Flow Dot (Animated) */}
      <circle
        r="3"
        fill="#bb86fc"
        className="edge-dot"
        style={{
          offsetPath: `path('${edgePath}')`,
          filter: 'drop-shadow(0 0 5px #bb86fc)'
        }}
      />

      <EdgeLabelRenderer>
        <div
          className="edge-insert-btn"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 5
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(data as any)?.label && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--vscode-editorWidget-background)',
                border: '1px solid var(--vscode-editorWidget-border)',
                color: 'var(--vscode-foreground)',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                whiteSpace: 'nowrap',
                opacity: 0.9
              }}
            >
              {(data as any).label}
            </div>
          )}
          <button
            className="nodrag"
            onClick={(event) => {
              event.stopPropagation();
              const onInsert = (data as any)?.onInsert;
              if (typeof onInsert === 'function') {
                onInsert(props, event.clientX, event.clientY);
              }
            }}
            title="Insert node"
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '10px',
              border: '1px solid var(--vscode-editorWidget-border)',
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '18px',
              padding: 0
            }}
          >
            +
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export const edgeTypes = {
  insertable: InsertableEdge
};
